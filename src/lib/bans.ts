import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { PANEL_ADMIN, type BanFilters, type BanRow, type BansResponse } from '@/lib/bansShared';

/** Сколько банов отдаётся за раз — таблица в панели листается целиком. */
const LIMIT = 500;

/** Окно, в котором бан из игры связывается с недавно завершённой проверкой. */
const CHECK_ATTRIBUTION_WINDOW_MS = 5 * 60 * 1000;

function buildWhere(projectId: string, filters: BanFilters): Prisma.BanWhereInput {
  const where: Prisma.BanWhereInput = { projectId };

  if (filters.status === 'active') where.active = true;
  if (filters.status === 'lifted') where.active = false;

  if (filters.serverId !== 'all') where.serverId = filters.serverId;

  if (filters.name) where.name = { contains: filters.name, mode: 'insensitive' };
  if (filters.steamId) where.steamId = { contains: filters.steamId };
  if (filters.reason) where.reason = { contains: filters.reason, mode: 'insensitive' };

  return where;
}

export async function listBans(projectId: string, filters: BanFilters): Promise<BansResponse> {
  const [rows, total, active, servers] = await Promise.all([
    prisma.ban.findMany({
      where: buildWhere(projectId, filters),
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
      include: { server: { select: { name: true } } },
    }),
    prisma.ban.count({ where: { projectId } }),
    prisma.ban.count({ where: { projectId, active: true } }),
    prisma.server.findMany({
      where: { projectId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const bans: BanRow[] = rows.map((row) => ({
    id: row.id,
    steamId: row.steamId,
    name: row.name ?? row.steamId,
    reason: row.reason ?? '—',
    admin: row.admin,
    serverId: row.serverId,
    serverName: row.server?.name ?? '—',
    ip: row.ip,
    status: row.active ? 'active' : 'lifted',
    createdAt: row.createdAt.toISOString(),
    unbannedAt: row.unbannedAt?.toISOString() ?? null,
  }));

  return { bans, total, active, servers };
}

/**
 * Кто выдал бан. Плагин в `OnUserBanned` автора не сообщает — его там просто нет,
 * поэтому панель узнаёт себя по недавно завершённой проверке с исходом «бан».
 * Для остальных банов (консоль, другие плагины) автор остаётся неизвестным.
 */
export async function resolveBanAdmin(
  projectId: string,
  steamId: string,
  reason: string | null,
  at: Date,
): Promise<string | null> {
  const since = new Date(at.getTime() - CHECK_ATTRIBUTION_WINDOW_MS);

  const own = await prisma.playerCheck.findFirst({
    where: {
      projectId,
      steamId,
      status: 'finished',
      outcome: { in: ['ban', 'team_ban'] },
      finishedAt: { gte: since },
    },
    select: { admin: true },
  });
  if (own) return own.admin ?? PANEL_ADMIN;

  // Бан тимы прилетает и на сопартийцев — своей проверки у них нет,
  // связываем их с проверкой лидера по совпадающей причине.
  if (!reason) return null;

  const team = await prisma.playerCheck.findFirst({
    where: {
      projectId,
      status: 'finished',
      outcome: 'team_ban',
      reason,
      finishedAt: { gte: since },
    },
    select: { admin: true },
  });

  return team ? (team.admin ?? PANEL_ADMIN) : null;
}
