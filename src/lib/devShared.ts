/**
 * Раздел «Разработка» — рычаги всего сайта, а не одного проекта: ключ Steam Web API
 * и выдача доступа по нику. Общее для сервера и браузера: prisma сюда не тянется.
 */

/**
 * Кому раздел виден. Это не роль в проекте и не право сотрудника: список
 * разработчиков сайта правится только здесь, в базе его нет намеренно —
 * иначе владелец проекта смог бы выписать его себе через свою же панель.
 */
export const DEVELOPER_LOGINS = ['r1ngo178', 'do3u'];

const DEVELOPERS = new Set(DEVELOPER_LOGINS);

/** Логины в базе лежат в нижнем регистре (см. normalizeLogin) — сверяем так же. */
export function isDeveloper(login: string | null | undefined): boolean {
  if (!login) return false;
  return DEVELOPERS.has(login.trim().toLowerCase());
}

/** Что раздел знает о ключе Steam: само значение наружу не отдаётся. */
export interface SteamKeyState {
  /** Ключ задан — из базы или из переменной окружения. */
  present: boolean;
  /** Хвост ключа для опознания: «…A1B2». Пусто, если ключа нет. */
  hint: string;
  /** Ключ взят из STEAM_API_KEY: его можно перекрыть значением из базы, но не стереть отсюда. */
  fromEnv: boolean;
}

/** Строка списка проектов в разделе «Разработка». */
export interface DevProjectRow {
  id: string;
  name: string;
  slug: string;
  /** Логин владельца; если приглашение ещё не принято — имя из записи сотрудника. */
  owner: string;
  ownerEmail: string | null;
  expiresAt: string | null;
  active: boolean;
  daysLeft: number | null;
  serversCount: number;
  createdAt: string;
}

/** Ключ Steam Web API — 32 шестнадцатеричных символа. */
export function isSteamApiKey(raw: string): boolean {
  return /^[0-9A-Fa-f]{32}$/.test(raw.trim());
}

/** Хвост ключа для показа в интерфейсе. */
export function keyHint(key: string): string {
  return key.length > 4 ? key.slice(-4) : key;
}
