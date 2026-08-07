import { prisma } from '@/lib/prisma';
import { lookupIp } from '@/lib/geo';
import type { PlayerStatus } from '@/lib/types';

/** Игрок, замеченный с того же адреса. */
export interface IpNeighbour {
  steamId: string;
  name: string;
  status: PlayerStatus;
  /** Сидит на этом адресе прямо сейчас; иначе — заходил с него раньше. */
  current: boolean;
  lastSeenAt: string; // ISO
}

/** Что показывает окошко по клику на IP в карточке игрока. */
export interface IpLookup {
  ip: string;
  isp: string | null;
  city: string | null;
  country: string | null;
  isVpn: boolean | null;
  neighbours: IpNeighbour[];
}

/** Сколько соседей по адресу показывать. */
const NEIGHBOUR_LIMIT = 20;

/**
 * Кто ещё играет с этого адреса плюс город, страна и провайдер.
 * Соседи собираются из текущего IP игроков и из истории сессий: адрес мог смениться,
 * но совпадение в прошлом — тоже повод присмотреться.
 */
export async function lookupIpDetails(ip: string): Promise<IpLookup> {
  const [details, current, sessions] = await Promise.all([
    lookupIp(ip),
    prisma.player.findMany({
      where: { ip },
      select: { steamId: true, name: true, status: true, lastSeenAt: true },
      take: NEIGHBOUR_LIMIT,
    }),
    prisma.playerSession.findMany({
      where: { ip },
      select: { steamId: true },
      distinct: ['steamId'],
      take: NEIGHBOUR_LIMIT,
    }),
  ]);

  const byId = new Map<string, IpNeighbour>(
    current.map((p) => [
      p.steamId,
      {
        steamId: p.steamId,
        name: p.name,
        status: p.status as PlayerStatus,
        current: true,
        lastSeenAt: p.lastSeenAt.toISOString(),
      },
    ]),
  );

  // Те, кто заходил с этого адреса раньше, но сейчас сидит с другого.
  const past = sessions.map((s) => s.steamId).filter((steamId) => !byId.has(steamId));
  if (past.length > 0) {
    const rows = await prisma.player.findMany({
      where: { steamId: { in: past } },
      select: { steamId: true, name: true, status: true, lastSeenAt: true },
    });

    for (const row of rows) {
      byId.set(row.steamId, {
        steamId: row.steamId,
        name: row.name,
        status: row.status as PlayerStatus,
        current: false,
        lastSeenAt: row.lastSeenAt.toISOString(),
      });
    }
  }

  const neighbours = Array.from(byId.values())
    .sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, NEIGHBOUR_LIMIT);

  return {
    ip,
    isp: details.isp,
    city: details.city,
    country: details.country,
    isVpn: details.isVpn,
    neighbours,
  };
}
