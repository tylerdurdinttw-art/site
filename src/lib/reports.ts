import { prisma } from '@/lib/prisma';
import { getSettings } from '@/lib/settings';
import type { ReportedPlayer } from '@/lib/reportsShared';
import type { PlayerStatus } from '@/lib/types';

/** Сколько жалоб просматривается при сборке списка. */
const REPORT_LIMIT = 2000;

/**
 * Игроки, на которых жаловались. Список собирается из таблицы `reports`
 * и группируется по SteamID: одна строка — один игрок, а не одна жалоба.
 *
 * Настройки раздела применяются здесь же:
 * `deleteAfterDays` отсекает старые жалобы, `ignoreAfterCheckHours` убирает
 * из выдачи тех, кого недавно уже проверяли.
 */
export async function listReportedPlayers(projectId: string): Promise<ReportedPlayer[]> {
  const settings = await getSettings(projectId);

  const since =
    settings.reports.deleteAfterDays > 0
      ? new Date(Date.now() - settings.reports.deleteAfterDays * 24 * 60 * 60 * 1000)
      : null;

  const reports = await prisma.report.findMany({
    where: since ? { projectId, createdAt: { gte: since } } : { projectId },
    orderBy: { createdAt: 'desc' },
    take: REPORT_LIMIT,
    include: { server: { select: { name: true } } },
  });
  if (reports.length === 0) return [];

  // Жалобы отсортированы свежими вперёд, поэтому первая встреченная — последняя по времени.
  const grouped = new Map<string, ReportedPlayer>();

  for (const report of reports) {
    const existing = grouped.get(report.targetSteamId);
    if (existing) {
      existing.reportsCount += 1;
      continue;
    }

    grouped.set(report.targetSteamId, {
      steamId: report.targetSteamId,
      name: report.targetName ?? report.targetSteamId,
      status: 'offline',
      avatarUrl: null,
      serverName: report.server?.name ?? '—',
      reportsCount: 1,
      lastReason: report.subject ?? report.type,
      lastReporterName: report.reporterName ?? report.reporterSteamId,
      lastReportAt: report.createdAt.toISOString(),
      checkActive: false,
      bannedNow: false,
    });
  }

  const steamIds = Array.from(grouped.keys());

  const [players, avatars, checks, bans] = await Promise.all([
    prisma.player.findMany({
      where: { projectId, steamId: { in: steamIds } },
      select: { steamId: true, name: true, status: true, server: { select: { name: true } } },
    }),
    prisma.steamProfile.findMany({
      where: { steamId: { in: steamIds }, avatarUrl: { not: null } },
      select: { steamId: true, avatarUrl: true },
    }),
    prisma.playerCheck.findMany({
      where: { projectId, status: 'active', steamId: { in: steamIds } },
      select: { steamId: true },
    }),
    prisma.ban.findMany({
      where: { projectId, active: true, steamId: { in: steamIds } },
      select: { steamId: true },
      distinct: ['steamId'],
    }),
  ]);

  const avatarMap = new Map(avatars.map((a) => [a.steamId, a.avatarUrl]));
  const checkSet = new Set(checks.map((c) => c.steamId));
  const banSet = new Set(bans.map((b) => b.steamId));

  for (const player of players) {
    const row = grouped.get(player.steamId);
    if (!row) continue;
    // Ник из базы игроков свежее того, что лежал в жалобе.
    row.name = player.name;
    row.status = player.status as PlayerStatus;
    if (player.server?.name) row.serverName = player.server.name;
  }

  for (const row of grouped.values()) {
    row.avatarUrl = avatarMap.get(row.steamId) ?? null;
    row.checkActive = checkSet.has(row.steamId);
    row.bannedNow = banSet.has(row.steamId);
  }

  let rows = Array.from(grouped.values());

  // «Игнорировать репорты после проверки»: игрок, проверенный недавно, из списка уходит.
  const ignoreHours = settings.reports.ignoreAfterCheckHours;
  if (ignoreHours > 0) {
    const checkedSince = new Date(Date.now() - ignoreHours * 60 * 60 * 1000);
    const checked = await prisma.playerCheck.findMany({
      where: {
        projectId,
        status: 'finished',
        steamId: { in: steamIds },
        finishedAt: { gte: checkedSince },
      },
      select: { steamId: true },
    });
    const skip = new Set(checked.map((c) => c.steamId));
    rows = rows.filter((row) => !skip.has(row.steamId));
  }

  // Больше всего жалоб — выше; при равенстве побеждает свежая.
  rows.sort(
    (a, b) => b.reportsCount - a.reportsCount || b.lastReportAt.localeCompare(a.lastReportAt),
  );

  return rows;
}

/**
 * Убирает все жалобы на игрока и обнуляет его счётчик.
 * Вызывается по настройкам «удалять репорты после блокировки / после проверки».
 */
export async function dropReportsFor(projectId: string, steamId: string): Promise<void> {
  await prisma.report.deleteMany({ where: { projectId, targetSteamId: steamId } });
  await prisma.player.updateMany({ where: { projectId, steamId }, data: { reportsCount: 0 } });
}

/** Полная очистка раздела — кнопка «Удалить все репорты» в настройках. */
export async function deleteAllReports(projectId: string): Promise<number> {
  const { count } = await prisma.report.deleteMany({ where: { projectId } });
  await prisma.player.updateMany({
    where: { projectId, reportsCount: { gt: 0 } },
    data: { reportsCount: 0 },
  });
  return count;
}
