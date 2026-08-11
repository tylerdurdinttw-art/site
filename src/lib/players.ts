import { prisma } from '@/lib/prisma';
import { gridSquare } from '@/lib/grid';
import { getPositions } from '@/lib/positions';
import { getSteamInfo } from '@/lib/steam';
import { lookupIp } from '@/lib/geo';
import type {
  ClientType,
  CombatStats,
  Player,
  PlayerActivity,
  PlayerDetails,
  PlayerReport,
  TeamMate,
  TeamMode,
} from '@/lib/types';

/** SteamID64 лицензионного клиента: 17 цифр, начинается с 7656119. */
export function isValidSteamId64(steamId: string): boolean {
  return /^7656119\d{10}$/.test(steamId);
}

/**
 * Плагин присылает флаг лицензионности, панель ему доверяет,
 * но формат ID проверяет сама: битый ID -> pirate в любом случае.
 */
export function resolveClientType(steamId: string, licensedFlag: boolean | undefined): ClientType {
  if (!isValidSteamId64(steamId)) return 'pirate';
  return licensedFlag === false ? 'pirate' : 'licensed';
}

/** Полный список игроков проекта — без пагинации и фильтров (по ТЗ этапа). */
export async function listPlayers(projectId: string): Promise<Player[]> {
  const rows = await prisma.player.findMany({
    where: { projectId },
    include: { server: true },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });

  const ips = Array.from(new Set(rows.map((r) => r.ip).filter((v): v is string => Boolean(v))));
  const ipRows = ips.length
    ? await prisma.ipInfo.findMany({ where: { ip: { in: ips } } })
    : [];
  const ipMap = new Map(ipRows.map((r) => [r.ip, r]));

  // Аватары берём из кеша Steam: за ними в сеть тут не ходим, список должен быть быстрым.
  const avatarRows = rows.length
    ? await prisma.steamProfile.findMany({
        where: { steamId: { in: rows.map((r) => r.steamId) }, avatarUrl: { not: null } },
        select: { steamId: true, avatarUrl: true },
      })
    : [];
  const avatarMap = new Map(avatarRows.map((r) => [r.steamId, r.avatarUrl]));

  return rows.map((row) => {
    const info = row.ip ? ipMap.get(row.ip) : undefined;
    return {
      steamId: row.steamId,
      name: row.name,
      clientType: row.clientType as ClientType,
      serverId: row.serverId ?? '',
      serverName: row.server?.name ?? '—',
      status: row.status,
      ip: row.ip ?? '',
      ping: row.ping,
      isp: info?.isp ?? null,
      city: info?.city ?? null,
      country: info?.country ?? null,
      isAfk: row.isAfk,
      reportsCount: row.reportsCount,
      lastSeenAt: row.lastSeenAt.toISOString(),
      avatarUrl: avatarMap.get(row.steamId) ?? null,
    } satisfies Player;
  });
}

/** 1 — соло, 2 — дуо, 3 — трио, 4 — сквад, 5 и больше — клан. */
export function teamMode(teamSize: number): TeamMode {
  if (teamSize <= 1) return 'solo';
  if (teamSize === 2) return 'duo';
  if (teamSize === 3) return 'trio';
  if (teamSize === 4) return 'squad';
  return 'clan';
}

/**
 * Наиграно на проекте: сумма закрытых сессий плюс текущая незакрытая.
 * Считается по всем серверам панели, а не по одному.
 */
async function playtimeSec(projectId: string, steamId: string): Promise<number> {
  const [closed, open] = await Promise.all([
    prisma.playerSession.aggregate({
      where: { projectId, steamId, endedAt: { not: null } },
      _sum: { durationSec: true },
    }),
    prisma.playerSession.findMany({
      where: { projectId, steamId, endedAt: null },
      select: { startedAt: true },
    }),
  ]);

  const now = Date.now();
  const running = open.reduce(
    (acc, s) => acc + Math.max(0, Math.round((now - s.startedAt.getTime()) / 1000)),
    0,
  );

  return (closed._sum.durationSec ?? 0) + running;
}

/** Длительность текущей сессии, секунд. null — открытой сессии нет. */
async function currentSessionSec(projectId: string, steamId: string): Promise<number | null> {
  const open = await prisma.playerSession.findFirst({
    where: { projectId, steamId, endedAt: null },
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true },
  });
  if (!open) return null;
  return Math.max(0, Math.round((Date.now() - open.startedAt.getTime()) / 1000));
}

/**
 * Боевая статистика за неделю. Плагин шлёт по событию на каждое убийство
 * (`player_killed`, steamId — убийца) и на каждую смерть от рук игрока
 * (`player_died`, steamId — погибший), поэтому убийства и смерти считаются
 * независимо и одно и то же событие в обе стороны не попадает.
 */
async function combatStats(projectId: string, steamId: string): Promise<CombatStats> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const events = await prisma.playerEvent.findMany({
    where: {
      projectId,
      steamId,
      createdAt: { gte: since },
      type: { in: ['player_killed', 'player_died'] },
    },
    select: { type: true, payload: true },
  });

  let kills = 0;
  let deaths = 0;
  let headshots = 0;

  for (const event of events) {
    if (event.type === 'player_died') {
      deaths += 1;
      continue;
    }

    kills += 1;
    const payload = (event.payload ?? {}) as { headshot?: boolean };
    if (payload.headshot === true) headshots += 1;
  }

  return { kills, deaths, headshots, kd: kdRatio(kills, deaths) };
}

/**
 * K/D в привычном для игроков виде: без смертей отношение равно числу убийств
 * (а не единице и не бесконечности), а у игрока без боёв это честный ноль.
 */
export function kdRatio(kills: number, deaths: number): number {
  if (deaths <= 0) return kills;
  return kills / deaths;
}

/** Состав команды: игроки того же сервера с той же командой из RelationshipManager. */
async function teamMates(
  projectId: string,
  steamId: string,
  serverId: string | null,
): Promise<TeamMate[]> {
  if (!serverId) return [];

  const events = await prisma.playerEvent.findMany({
    where: { projectId, serverId, steamId, type: 'team_updated' },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { payload: true },
  });

  const payload = (events[0]?.payload ?? {}) as { members?: unknown };
  const ids = Array.isArray(payload.members)
    ? payload.members.filter((v): v is string => typeof v === 'string' && v !== steamId)
    : [];
  if (ids.length === 0) return [];

  const [players, avatars] = await Promise.all([
    prisma.player.findMany({
      where: { projectId, steamId: { in: ids } },
      select: { steamId: true, name: true, status: true },
    }),
    prisma.steamProfile.findMany({
      where: { steamId: { in: ids }, avatarUrl: { not: null } },
      select: { steamId: true, avatarUrl: true },
    }),
  ]);
  const avatarMap = new Map(avatars.map((a) => [a.steamId, a.avatarUrl]));

  return players.map((p) => ({
    steamId: p.steamId,
    name: p.name,
    status: p.status,
    avatarUrl: avatarMap.get(p.steamId) ?? null,
  }));
}

async function playerReports(projectId: string, steamId: string): Promise<PlayerReport[]> {
  const rows = await prisma.report.findMany({
    where: { projectId, targetSteamId: steamId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return rows.map((r) => ({
    id: r.id,
    reporterName: r.reporterName,
    reporterSteamId: r.reporterSteamId,
    subject: r.subject,
    message: r.message,
    createdAt: r.createdAt.toISOString(),
  }));
}

async function playerActivity(projectId: string, steamId: string): Promise<PlayerActivity[]> {
  const rows = await prisma.playerEvent.findMany({
    where: { projectId, steamId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { server: { select: { name: true } } },
  });

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    createdAt: r.createdAt.toISOString(),
    serverName: r.server?.name ?? '—',
  }));
}

/** Карточка игрока для модального окна. null — такого SteamID панель не видела. */
export async function getPlayerDetails(
  projectId: string,
  steamId: string,
): Promise<PlayerDetails | null> {
  const row = await prisma.player.findUnique({
    where: { projectId_steamId: { projectId, steamId } },
    include: { server: true },
  });
  if (!row) return null;

  const [ipInfo, steam, seconds, sessionSec, combat, team, reports, activity, avatar] =
    await Promise.all([
      row.ip ? lookupIp(row.ip) : Promise.resolve(null),
      getSteamInfo(steamId),
      playtimeSec(projectId, steamId),
      currentSessionSec(projectId, steamId),
      combatStats(projectId, steamId),
      teamMates(projectId, steamId, row.serverId),
      playerReports(projectId, steamId),
      playerActivity(projectId, steamId),
      prisma.steamProfile.findUnique({ where: { steamId }, select: { avatarUrl: true } }),
    ]);

  // Координаты живут в памяти процесса, поэтому квадрат есть только у игроков на сервере.
  const snapshot = row.serverId ? getPositions(row.serverId) : null;
  const position = snapshot?.players.find((p) => p.steamId === steamId) ?? null;

  return {
    steamId: row.steamId,
    name: row.name,
    clientType: row.clientType as ClientType,
    status: row.status,
    isAfk: row.isAfk,
    reportsCount: row.reportsCount,
    ping: row.ping,
    avatarUrl: avatar?.avatarUrl ?? null,

    teamSize: row.teamSize,
    teamMode: teamMode(row.teamSize),
    language: row.language,

    serverId: row.serverId ?? '',
    serverName: row.server?.name ?? '—',
    // Первый заход на сервер проекта — момент, когда игрок впервые попал в базу панели.
    firstSeenAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    playtimeSec: seconds,
    sessionSec,

    square: position ? gridSquare(position.x, position.z, row.server?.worldSize ?? null) : null,
    movedAt: position && !position.isAfk && snapshot ? new Date(snapshot.at).toISOString() : null,

    combat,
    team,
    reports,
    activity,

    ip: row.ip ?? '',
    city: ipInfo?.city ?? null,
    country: ipInfo?.country ?? null,
    isp: ipInfo?.isp ?? null,
    isVpn: ipInfo?.isVpn === true,

    steam,

    discord: row.discord,
    checkRequestedAt: row.checkRequestedAt?.toISOString() ?? null,
  } satisfies PlayerDetails;
}

/** total — по всем известным SteamID проекта, историю не чистим. */
export async function getStats(projectId: string) {
  const [total, online, sleeping] = await Promise.all([
    prisma.player.count({ where: { projectId } }),
    prisma.player.count({ where: { projectId, status: 'online' } }),
    prisma.player.count({ where: { projectId, status: 'sleeping' } }),
  ]);

  // «На сервере» = online + sleeping, всё остальное — оффлайн.
  return { total, online: online + sleeping, offline: total - online - sleeping };
}
