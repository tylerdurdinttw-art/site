import { prisma } from '@/lib/prisma';

/** Сервер считается онлайн, если heartbeat приходил не дольше двух интервалов назад. */
const SERVER_ONLINE_WINDOW_MS = 90_000;

export interface Overview {
  online: number;
  peakToday: number;
  serversOnline: number;
  serversTotal: number;
  connecting: number;
  queued: number;
}

/**
 * Пик онлайна за сегодня: максимальное число одновременных сессий.
 * Считается разметкой начал и концов сессий (sweep line), без отдельной таблицы снапшотов.
 */
async function peakOnlineToday(): Promise<number> {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const now = new Date();

  const sessions = await prisma.playerSession.findMany({
    where: { OR: [{ endedAt: null }, { endedAt: { gte: dayStart } }], startedAt: { lte: now } },
    select: { startedAt: true, endedAt: true },
  });

  if (sessions.length === 0) return 0;

  const points: { at: number; delta: number }[] = [];
  for (const s of sessions) {
    const from = Math.max(s.startedAt.getTime(), dayStart.getTime());
    const to = (s.endedAt ?? now).getTime();
    if (to < from) continue;
    points.push({ at: from, delta: 1 });
    points.push({ at: to, delta: -1 });
  }

  // Закрытия обрабатываем раньше открытий в одну и ту же миллисекунду.
  points.sort((a, b) => a.at - b.at || a.delta - b.delta);

  let current = 0;
  let peak = 0;
  for (const p of points) {
    current += p.delta;
    if (current > peak) peak = current;
  }
  return peak;
}

export async function getOverview(): Promise<Overview> {
  const since = new Date(Date.now() - SERVER_ONLINE_WINDOW_MS);

  const [online, serversTotal, serversOnline, queues, peak] = await Promise.all([
    prisma.player.count({ where: { status: { in: ['online', 'sleeping'] } } }),
    prisma.server.count(),
    prisma.server.count({ where: { lastHeartbeatAt: { gte: since } } }),
    prisma.server.aggregate({
      where: { lastHeartbeatAt: { gte: since } },
      _sum: { queuedPlayers: true, joiningPlayers: true },
    }),
    peakOnlineToday(),
  ]);

  return {
    online,
    peakToday: Math.max(peak, online),
    serversOnline,
    serversTotal,
    connecting: queues._sum.joiningPlayers ?? 0,
    queued: queues._sum.queuedPlayers ?? 0,
  };
}

export interface ServerRow {
  id: string;
  name: string;
  online: boolean;
  players: number;
  maxPlayers: number;
  lastHeartbeatAt: string | null;
  /** По seed + размеру мира карточка сервера тянет превью карты. */
  seed: number | null;
  worldSize: number | null;
}

export async function listServers(): Promise<ServerRow[]> {
  const since = new Date(Date.now() - SERVER_ONLINE_WINDOW_MS);

  const servers = await prisma.server.findMany({ orderBy: { name: 'asc' } });
  const counts = await prisma.player.groupBy({
    by: ['serverId'],
    where: { status: { in: ['online', 'sleeping'] } },
    _count: { _all: true },
  });
  const countMap = new Map<string, number>(
    counts
      .filter((c): c is typeof c & { serverId: string } => c.serverId !== null)
      .map((c) => [c.serverId, c._count._all]),
  );

  return servers.map((s) => ({
    id: s.id,
    name: s.name,
    online: Boolean(s.lastHeartbeatAt && s.lastHeartbeatAt >= since),
    players: countMap.get(s.id) ?? 0,
    maxPlayers: s.maxPlayers ?? 0,
    lastHeartbeatAt: s.lastHeartbeatAt?.toISOString() ?? null,
    seed: s.seed,
    worldSize: s.worldSize,
  }));
}
