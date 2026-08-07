/**
 * Общая часть банов для клиента и сервера.
 * Здесь не должно быть импортов Prisma — файл попадает в клиентский бандл.
 */

/** Статус в таблице: бан действует или уже снят. */
export type BanStatus = 'active' | 'lifted';

/** Значение селекта «Статус»; all — не фильтровать. */
export type BanStatusFilter = BanStatus | 'all';

export interface BanRow {
  id: string;
  steamId: string;
  name: string;
  reason: string;
  /** null — бан пришёл из игры, автор неизвестен. */
  admin: string | null;
  serverId: string;
  serverName: string;
  ip: string | null;
  status: BanStatus;
  createdAt: string; // ISO
  unbannedAt: string | null; // ISO
}

export interface BansResponse {
  bans: BanRow[];
  /** Счётчики считаются по всей таблице, а не по текущему фильтру. */
  total: number;
  active: number;
  servers: { id: string; name: string }[];
}

export interface BanFilters {
  name: string;
  steamId: string;
  reason: string;
  serverId: string; // 'all' — все серверы
  status: BanStatusFilter;
}

export const EMPTY_BAN_FILTERS: BanFilters = {
  name: '',
  steamId: '',
  reason: '',
  serverId: 'all',
  status: 'active',
};

/** Кем подписываются баны, выданные из панели. */
export const PANEL_ADMIN = 'Панель';

export function isBanStatusFilter(value: unknown): value is BanStatusFilter {
  return value === 'all' || value === 'active' || value === 'lifted';
}
