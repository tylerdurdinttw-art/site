import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Выборки для публичного API бан-листа. Формат ответа — контракт с чужими
 * сайтами: поля только добавляются, не переименовываются и не удаляются.
 * IP игроков сюда не попадают намеренно.
 */

export interface PublicBan {
  id: string;
  steamId: string;
  name: string | null;
  reason: string | null;
  /** Кто выдал; null — бан пришёл из игры, автор неизвестен. */
  admin: string | null;
  server: { id: string; name: string };
  active: boolean;
  createdAt: string; // ISO
  unbannedAt: string | null; // ISO
}

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 50;

const include = { server: { select: { name: true } } } as const;
type BanWithServer = Prisma.BanGetPayload<{ include: typeof include }>;

function toPublic(row: BanWithServer): PublicBan {
  return {
    id: row.id,
    steamId: row.steamId,
    name: row.name,
    reason: row.reason,
    admin: row.admin,
    server: { id: row.serverId, name: row.server.name },
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    unbannedAt: row.unbannedAt?.toISOString() ?? null,
  };
}

export interface PublicBanQuery {
  status: 'active' | 'lifted' | 'all';
  search: string;
  serverId: string | null;
  /** Только баны, выданные или снятые после этого момента — для синхронизации. */
  since: Date | null;
  page: number;
  limit: number;
}

export async function listPublicBans(projectId: string, q: PublicBanQuery) {
  const where: Prisma.BanWhereInput = { projectId };

  if (q.status === 'active') where.active = true;
  if (q.status === 'lifted') where.active = false;
  if (q.serverId) where.serverId = q.serverId;

  const and: Prisma.BanWhereInput[] = [];
  if (q.search) {
    and.push({
      OR: [
        { steamId: q.search },
        { name: { contains: q.search, mode: 'insensitive' } },
        { reason: { contains: q.search, mode: 'insensitive' } },
      ],
    });
  }
  if (q.since) {
    and.push({ OR: [{ createdAt: { gt: q.since } }, { unbannedAt: { gt: q.since } }] });
  }
  if (and.length) where.AND = and;

  const [rows, total] = await Promise.all([
    prisma.ban.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include,
    }),
    prisma.ban.count({ where }),
  ]);

  return {
    bans: rows.map(toPublic),
    page: q.page,
    limit: q.limit,
    total,
    pages: Math.max(1, Math.ceil(total / q.limit)),
  };
}

/** Забанен ли игрок сейчас и вся его история банов в проекте. */
export async function publicBanStatus(projectId: string, steamId: string) {
  const rows = await prisma.ban.findMany({
    where: { projectId, steamId },
    orderBy: { createdAt: 'desc' },
    take: MAX_PAGE_SIZE,
    include,
  });
  const bans = rows.map(toPublic);
  const active = bans.find((b) => b.active) ?? null;

  return { steamId, banned: !!active, activeBan: active, bans };
}

/** Счётчики для шапки бан-листа на сайте. */
export async function publicBanStats(projectId: string) {
  const [total, active, servers] = await Promise.all([
    prisma.ban.count({ where: { projectId } }),
    prisma.ban.count({ where: { projectId, active: true } }),
    prisma.server.findMany({
      where: { projectId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  return { total, active, lifted: total - active, servers };
}
