import { prisma } from '@/lib/prisma';
import { getRustMapsApiKey } from '@/lib/appSettings';

/**
 * Карты с rustmaps.com по паре seed + размер мира.
 *
 * Ключ задаётся в разделе «Разработка», а если там пусто — берётся из
 * RUSTMAPS_API_KEY (регистрация на rustmaps.com -> Dashboard -> API keys).
 * Картинка скачивается один раз и кладётся в таблицу rustmaps_images: дальше панель
 * отдаёт её из базы и наружу не ходит.
 */

const API_BASE = 'https://api.rustmaps.com/v4';
const REQUEST_TIMEOUT_MS = 20_000;
/** Повторять неудачную попытку не чаще раза в 10 минут, чтобы не долбить API. */
const RETRY_AFTER_MS = 10 * 60 * 1000;
/** Потолок на размер картинки — карты бывают крупные, но не безразмерные. */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export const mapKey = (seed: number, worldSize: number) => `${seed}_${worldSize}`;

export type RustMapStatus =
  | { state: 'ready'; key: string }
  | { state: 'generating'; key: string }
  | { state: 'no_key' }
  | { state: 'not_found'; key: string; message: string }
  | { state: 'error'; key: string; message: string };

interface RustMapsResponse {
  data?: {
    imageUrl?: string;
    rawImageUrl?: string;
    imageIconUrl?: string;
    thumbnailUrl?: string;
    isCustomMap?: boolean;
    [key: string]: unknown;
  };
  meta?: { status?: string; statusCode?: number; errors?: unknown };
  [key: string]: unknown;
}

async function apiKey(): Promise<string | null> {
  const key = await getRustMapsApiKey();
  return key ? key : null;
}

/** rustmaps отдаёт несколько вариантов ссылки — берём самую крупную из доступных. */
function pickImageUrl(data: NonNullable<RustMapsResponse['data']>): string | null {
  return data.imageUrl ?? data.rawImageUrl ?? data.imageIconUrl ?? data.thumbnailUrl ?? null;
}

async function withTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function remember(key: string, seed: number, worldSize: number, message: string, isCustom = false) {
  await prisma.rustMapImage.upsert({
    where: { key },
    create: { key, seed, worldSize, lastError: message, isCustom },
    update: { lastError: message, isCustom, fetchedAt: new Date() },
  });
}

/** Заказ генерации процедурной карты. 201 — принято в работу, 409 — уже генерируется. */
async function requestGeneration(
  token: string,
  key: string,
  seed: number,
  worldSize: number,
): Promise<RustMapStatus> {
  let res: Response;
  try {
    res = await withTimeout(`${API_BASE}/maps`, {
      method: 'POST',
      headers: { 'X-API-Key': token, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ size: worldSize, seed, staging: false }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'сеть недоступна';
    await remember(key, seed, worldSize, message);
    return { state: 'error', key, message };
  }

  // 200 — карта уже есть: картинку заберёт следующий запрос, ошибку не запоминаем.
  if (res.ok || res.status === 409) return { state: 'generating', key };

  if (res.status === 401 || res.status === 403) {
    const message = 'rustmaps не дал сгенерировать карту: проверьте ключ и лимиты тарифа';
    await remember(key, seed, worldSize, message);
    return { state: 'error', key, message };
  }

  // Кастомную карту (levelurl) по seed не сгенерировать — rustmaps её не знает.
  const message = `rustmaps не знает карту с таким seed и размером (генерация: ${res.status})`;
  await remember(key, seed, worldSize, message, true);
  return { state: 'not_found', key, message };
}

/**
 * Гарантирует, что картинка карты лежит в базе.
 * Возвращает состояние, чтобы UI мог показать внятную причину, если карты нет.
 */
export async function ensureRustMap(seed: number, worldSize: number): Promise<RustMapStatus> {
  const key = mapKey(seed, worldSize);
  const cached = await prisma.rustMapImage.findUnique({ where: { key } });

  if (cached?.image && cached.image.length > 0) return { state: 'ready', key };

  const token = await apiKey();
  if (!token) return { state: 'no_key' };

  // Недавняя неудача — не дёргаем API на каждый заход на страницу.
  if (cached?.lastError && Date.now() - cached.fetchedAt.getTime() < RETRY_AFTER_MS) {
    return cached.isCustom
      ? { state: 'not_found', key, message: cached.lastError }
      : { state: 'error', key, message: cached.lastError };
  }

  let res: Response;
  try {
    // Порядок в пути — сначала размер, потом seed. Наоборот rustmaps отвечает ошибкой,
    // и панель навсегда застревала на запасном рельефе.
    res = await withTimeout(`${API_BASE}/maps/${worldSize}/${seed}?staging=false`, {
      headers: { 'X-API-Key': token, accept: 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'сеть недоступна';
    await remember(key, seed, worldSize, message);
    return { state: 'error', key, message };
  }

  if (res.status === 401 || res.status === 403) {
    const message = 'rustmaps отклонил ключ (проверьте RUSTMAPS_API_KEY)';
    await remember(key, seed, worldSize, message);
    return { state: 'error', key, message };
  }

  // 409 — карта ещё генерируется на их стороне, имеет смысл зайти позже.
  if (res.status === 409) {
    return { state: 'generating', key };
  }

  // 404 — процедурную карту с таким seed у них ещё никто не рисовал. Просим сгенерировать:
  // дальше GET отвечает 409, пока идёт генерация, и 200, когда картинка готова.
  if (res.status === 404) return requestGeneration(token, key, seed, worldSize);

  if (!res.ok) {
    const message = `rustmaps ответил ${res.status}`;
    await remember(key, seed, worldSize, message);
    return { state: 'error', key, message };
  }

  let payload: RustMapsResponse;
  try {
    payload = (await res.json()) as RustMapsResponse;
  } catch {
    const message = 'rustmaps вернул не JSON';
    await remember(key, seed, worldSize, message);
    return { state: 'error', key, message };
  }

  const data = payload.data;
  const imageUrl = data ? pickImageUrl(data) : null;

  if (!imageUrl) {
    const message = 'в ответе rustmaps нет ссылки на изображение';
    await remember(key, seed, worldSize, message, data?.isCustomMap === true);
    return { state: 'error', key, message };
  }

  let imageRes: Response;
  try {
    imageRes = await withTimeout(imageUrl, {});
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось скачать изображение';
    await remember(key, seed, worldSize, message);
    return { state: 'error', key, message };
  }

  if (!imageRes.ok) {
    const message = `изображение недоступно (${imageRes.status})`;
    await remember(key, seed, worldSize, message);
    return { state: 'error', key, message };
  }

  const buffer = Buffer.from(await imageRes.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    const message = `неожиданный размер изображения: ${buffer.length} байт`;
    await remember(key, seed, worldSize, message);
    return { state: 'error', key, message };
  }

  await prisma.rustMapImage.upsert({
    where: { key },
    create: {
      key,
      seed,
      worldSize,
      imageUrl,
      contentType: imageRes.headers.get('content-type') ?? 'image/png',
      image: buffer,
      isCustom: data?.isCustomMap === true,
      lastError: null,
    },
    update: {
      imageUrl,
      contentType: imageRes.headers.get('content-type') ?? 'image/png',
      image: buffer,
      isCustom: data?.isCustomMap === true,
      lastError: null,
      fetchedAt: new Date(),
    },
  });

  return { state: 'ready', key };
}

export async function getCachedImage(key: string) {
  const row = await prisma.rustMapImage.findUnique({ where: { key } });
  if (!row?.image || row.image.length === 0) return null;
  return { image: Buffer.from(row.image), contentType: row.contentType };
}

/**
 * Проверка ключа для раздела «Разработка»: спрашиваем карту известного вайпа.
 * Отказ по ключу rustmaps отдаёт как 401/403, всё остальное — уже про карту,
 * а не про ключ, и считается успехом.
 */
export async function checkRustMapsKey(key: string): Promise<{ ok: boolean; error?: string }> {
  let res: Response;
  try {
    res = await withTimeout(`${API_BASE}/maps/3500/1337?staging=false`, {
      headers: { 'X-API-Key': key, accept: 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'запрос не ушёл' };
  }

  if (res.status === 401 || res.status === 403) return { ok: false, error: 'rustmaps отклонил ключ' };
  if (res.status === 429) return { ok: false, error: 'rustmaps: лимит запросов исчерпан' };
  if (res.status >= 500) return { ok: false, error: `rustmaps ответил ${res.status}` };

  return { ok: true };
}
