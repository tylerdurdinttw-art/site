import { prisma } from '@/lib/prisma';
import { getSteamApiKey } from '@/lib/appSettings';

/**
 * Публичные данные из Steam Web API: часы в Rust и блокировки VAC/EAC.
 *
 * Ключ берётся из раздела «Разработка», а если там пусто — из STEAM_API_KEY
 * (steamcommunity.com/dev/apikey). Без ключа функция ничего не запрашивает
 * и отдаёт available: false — интерфейс в этом случае показывает прочерки, а не нули.
 * Ответ кешируется в steam_profiles на STEAM_CACHE_TTL_HOURS, чтобы не упереться в лимиты Steam.
 *
 * EAC отдельного эндпоинта не имеет: Steam считает бан EAC игровым баном (NumberOfGameBans),
 * а игр у аккаунта может быть несколько. Поэтому «EAC: да» означает игровой бан в библиотеке,
 * и для игрока Rust это почти всегда именно EAC.
 */

const RUST_APP_ID = 252490;
const TTL_HOURS = Number(process.env.STEAM_CACHE_TTL_HOURS ?? 12);
const TIMEOUT_MS = 8000;

export interface SteamInfo {
  /** Есть ключ и данные удалось получить (сейчас или раньше, из кеша). */
  available: boolean;
  /** Часы в Rust; null — профиль закрыт либо игра скрыта в профиле. */
  rustMinutes: number | null;
  /** Часы в Rust за две недели; null — Steam их не отдал (профиль закрыт или не играл). */
  rustMinutes2Weeks: number | null;
  vacBanned: boolean;
  vacBanCount: number;
  gameBanCount: number;
  /** Дней с последнего бана — общее число на VAC и игровой бан. */
  daysSinceLastBan: number | null;
  /** communityvisibilitystate: 1 — закрыт, 3 — открыт. null — не запрашивали. */
  visibility: number | null;
  /** Когда создан аккаунт Steam. */
  accountCreatedAt: string | null;
  /** Почему данных нет: нет ключа, ошибка сети, отказ Steam. */
  error: string | null;
}

const UNAVAILABLE = (error: string): SteamInfo => ({
  available: false,
  rustMinutes: null,
  rustMinutes2Weeks: null,
  vacBanned: false,
  vacBanCount: 0,
  gameBanCount: 0,
  daysSinceLastBan: null,
  visibility: null,
  accountCreatedAt: null,
  error,
});

interface SteamBans {
  SteamId?: string;
  VACBanned?: boolean;
  NumberOfVACBans?: number;
  NumberOfGameBans?: number;
  DaysSinceLastBan?: number;
}

interface BansResponse {
  players?: SteamBans[];
}

interface OwnedGamesResponse {
  response?: {
    games?: { appid?: number; playtime_forever?: number; playtime_2weeks?: number }[];
  };
}

interface SummariesResponse {
  response?: {
    players?: {
      steamid?: string;
      personaname?: string;
      avatarfull?: string;
      communityvisibilitystate?: number;
      timecreated?: number;
    }[];
  };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Steam ответил ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Проверка ключа для раздела «Разработка»: запрашиваем один публичный профиль.
 * Steam на неверный ключ отвечает 403, поэтому одного запроса достаточно.
 */
export async function checkSteamKey(key: string): Promise<{ ok: boolean; error?: string }> {
  // Публичный профиль одного из основателей Valve — он есть всегда.
  const probe = '76561197960435530';

  try {
    const data = await getJson<SummariesResponse>(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${probe}`,
    );
    if (!data.response?.players?.length) return { ok: false, error: 'Steam ответил пустым списком' };
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'запрос не ушёл';
    return { ok: false, error: message.includes('403') ? 'Steam отклонил ключ' : message };
  }
}

/** Читает из кеша, при промахе — из Steam Web API, и записывает в steam_profiles. */
export async function getSteamInfo(steamId: string): Promise<SteamInfo> {
  const cached = await prisma.steamProfile.findUnique({ where: { steamId } });
  if (cached && cached.expiresAt > new Date()) {
    return {
      available: cached.lastError === null,
      rustMinutes: cached.rustMinutes,
      rustMinutes2Weeks: cached.rustMinutes2Weeks,
      vacBanned: cached.vacBanned,
      vacBanCount: cached.vacBanCount,
      gameBanCount: cached.gameBanCount,
      daysSinceLastBan: cached.daysSinceLastBan,
      visibility: cached.visibility,
      accountCreatedAt: cached.accountCreatedAt?.toISOString() ?? null,
      error: cached.lastError,
    };
  }

  const key = await getSteamApiKey();
  if (!key) return UNAVAILABLE('ключ Steam Web API не задан');

  // Пиратский клиент шлёт ID вне диапазона SteamID64 — в Steam такого профиля нет.
  if (!/^7656119\d{10}$/.test(steamId)) return UNAVAILABLE('невалидный SteamID64');

  let bans: SteamBans | null = null;
  let rustMinutes: number | null = null;
  let rustMinutes2Weeks: number | null = null;
  let visibility: number | null = null;
  let accountCreatedAt: Date | null = null;
  let personaName: string | null = null;
  let avatarUrl: string | null = null;

  try {
    const bansData = await getJson<BansResponse>(
      `https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${key}&steamids=${steamId}`,
    );
    bans = bansData.players?.[0] ?? null;
    if (!bans) throw new Error('профиль не найден');
  } catch (err) {
    const error = err instanceof Error ? err.message : 'ошибка запроса';
    await saveProfile(steamId, null, error);
    return UNAVAILABLE(error);
  }

  // Часы — отдельным запросом: закрытый профиль отдаёт пустой ответ, это не ошибка.
  try {
    const games = await getJson<OwnedGamesResponse>(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}` +
        `&steamid=${steamId}&include_played_free_games=1&appids_filter[0]=${RUST_APP_ID}`,
    );
    const rust = games.response?.games?.find((g) => g.appid === RUST_APP_ID);
    rustMinutes = typeof rust?.playtime_forever === 'number' ? rust.playtime_forever : null;
    rustMinutes2Weeks = typeof rust?.playtime_2weeks === 'number' ? rust.playtime_2weeks : null;
  } catch {
    rustMinutes = null;
  }

  // Приватность, дата создания аккаунта и аватар — их показывает карточка игрока.
  try {
    const summaries = await getJson<SummariesResponse>(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`,
    );
    const profile = summaries.response?.players?.[0];
    visibility = typeof profile?.communityvisibilitystate === 'number'
      ? profile.communityvisibilitystate
      : null;
    accountCreatedAt = typeof profile?.timecreated === 'number'
      ? new Date(profile.timecreated * 1000)
      : null;
    personaName = profile?.personaname ?? null;
    avatarUrl = profile?.avatarfull ?? null;
  } catch {
    visibility = null;
  }

  const info: SteamInfo = {
    available: true,
    rustMinutes,
    rustMinutes2Weeks,
    vacBanned: Boolean(bans?.VACBanned),
    vacBanCount: bans?.NumberOfVACBans ?? 0,
    gameBanCount: bans?.NumberOfGameBans ?? 0,
    daysSinceLastBan:
      typeof bans?.DaysSinceLastBan === 'number' && bans.DaysSinceLastBan > 0
        ? bans.DaysSinceLastBan
        : null,
    visibility,
    accountCreatedAt: accountCreatedAt?.toISOString() ?? null,
    error: null,
  };

  await saveProfile(steamId, info, null, { personaName, avatarUrl, accountCreatedAt });
  return info;
}

async function saveProfile(
  steamId: string,
  info: SteamInfo | null,
  error: string | null,
  profile?: { personaName: string | null; avatarUrl: string | null; accountCreatedAt: Date | null },
) {
  // Ошибку тоже кешируем, иначе каждый заход в карточку будет долбить Steam.
  const expiresAt = new Date(Date.now() + (error ? 1 : TTL_HOURS) * 60 * 60 * 1000);
  const data = {
    personaName: profile?.personaName ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
    rustMinutes: info?.rustMinutes ?? null,
    rustMinutes2Weeks: info?.rustMinutes2Weeks ?? null,
    visibility: info?.visibility ?? null,
    accountCreatedAt: profile?.accountCreatedAt ?? null,
    vacBanned: info?.vacBanned ?? false,
    vacBanCount: info?.vacBanCount ?? 0,
    gameBanCount: info?.gameBanCount ?? 0,
    daysSinceLastBan: info?.daysSinceLastBan ?? null,
    lastError: error,
    fetchedAt: new Date(),
    expiresAt,
  };

  await prisma.steamProfile.upsert({
    where: { steamId },
    create: { steamId, ...data },
    update: data,
  });
}
