import { prisma } from '@/lib/prisma';
import { keyHint, type ApiKeyState } from '@/lib/devShared';

/**
 * Глобальные настройки сайта (таблица app_settings). Живут отдельно от настроек
 * проекта: значение одно на всю панель и правится только из раздела «Разработка».
 */

/** Ключ Steam Web API. Перекрывает переменную окружения STEAM_API_KEY. */
export const STEAM_API_KEY_SETTING = 'steam_api_key';

/** Ключ rustmaps.com. Перекрывает переменную окружения RUSTMAPS_API_KEY. */
export const RUSTMAPS_API_KEY_SETTING = 'rustmaps_api_key';

/**
 * Значения читаются на каждом запросе к Steam и в карточке игрока — держим их
 * несколько секунд в памяти процесса, чтобы не ходить в базу за одной строкой.
 * Срок короткий: правка из раздела «Разработка» должна вступать в силу сразу.
 */
const CACHE_MS = 10_000;

const cache = new Map<string, { value: string; until: number }>();

export async function getAppSetting(key: string): Promise<string> {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;

  const row = await prisma.appSetting.findUnique({ where: { key } });
  const value = row?.value ?? '';

  cache.set(key, { value, until: Date.now() + CACHE_MS });
  return value;
}

/** Пустая строка — осознанное «стереть»: строка из базы удаляется. */
export async function setAppSetting(key: string, raw: string): Promise<void> {
  const value = raw.trim();

  if (value) {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  } else {
    await prisma.appSetting.deleteMany({ where: { key } });
  }

  cache.set(key, { value, until: Date.now() + CACHE_MS });
}

/**
 * Ключ Steam Web API: сначала база, потом переменная окружения. Такой порядок
 * позволяет менять ключ из панели, не перезапуская сайт, но не теряет старый
 * способ настройки через .env.
 */
export async function getSteamApiKey(): Promise<string> {
  const stored = await getAppSetting(STEAM_API_KEY_SETTING);
  if (stored) return stored;
  return process.env.STEAM_API_KEY?.trim() ?? '';
}

/**
 * Ключ rustmaps.com: сначала база, потом переменная окружения — тот же порядок,
 * что и у Steam, чтобы ключ можно было поменять из панели без перезапуска сайта.
 */
export async function getRustMapsApiKey(): Promise<string> {
  const stored = await getAppSetting(RUSTMAPS_API_KEY_SETTING);
  if (stored) return stored;
  return process.env.RUSTMAPS_API_KEY?.trim() ?? '';
}

/** Что показывать в разделе «Разработка»: сам ключ наружу не уходит. */
async function keyState(setting: string, envValue: string | undefined): Promise<ApiKeyState> {
  const stored = await getAppSetting(setting);
  const fromEnv = envValue?.trim() ?? '';
  const key = stored || fromEnv;

  return {
    present: Boolean(key),
    hint: key ? keyHint(key) : '',
    fromEnv: !stored && Boolean(fromEnv),
  };
}

export function getSteamKeyState(): Promise<ApiKeyState> {
  return keyState(STEAM_API_KEY_SETTING, process.env.STEAM_API_KEY);
}

export function getRustMapsKeyState(): Promise<ApiKeyState> {
  return keyState(RUSTMAPS_API_KEY_SETTING, process.env.RUSTMAPS_API_KEY);
}
