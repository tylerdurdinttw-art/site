import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { accessStateOf } from '@/lib/accessShared';
import { rateLimit } from '@/lib/rateLimit';

/**
 * Публичный API бан-листа: его зовёт сайт проекта, а не браузер сотрудника.
 *
 * Вместо сессии — ключ проекта. В базе (panel_settings) лежит только его sha256:
 * открытое значение показывается один раз при выпуске, как пароль. Перевыпуск
 * старый ключ сразу гасит.
 *
 * Ключ даёт только чтение банов и ничего больше, IP игроков наружу не уходят.
 */

/** Ключ строки в panel_settings с хэшем ключа. */
export const BANLIST_KEY_SETTING = 'banlist_api_key_hash';
/** Префикс ключа — чтобы его было видно в конфиге сайта и в сканерах утечек. */
const KEY_PREFIX = 'qpb_';

/** Сколько запросов в минуту на один ключ. */
const LIMIT_PER_MIN = 120;

/** Сайт может звать API и прямо из браузера — CORS открыт для всех источников. */
export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'authorization, x-api-key',
  'access-control-max-age': '86400',
};

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Выпускает новый ключ проекта. Открытое значение возвращается один раз. */
export async function issueBanlistKey(projectId: string): Promise<string> {
  const key = KEY_PREFIX + randomBytes(24).toString('base64url');
  const value = hashKey(key);

  await prisma.panelSetting.upsert({
    where: { projectId_key: { projectId, key: BANLIST_KEY_SETTING } },
    create: { projectId, key: BANLIST_KEY_SETTING, value },
    update: { value },
  });

  return key;
}

export async function revokeBanlistKey(projectId: string): Promise<void> {
  await prisma.panelSetting.deleteMany({ where: { projectId, key: BANLIST_KEY_SETTING } });
}

/** Выпущен ли ключ и когда — сам ключ по хэшу уже не восстановить. */
export async function banlistKeyState(
  projectId: string,
): Promise<{ enabled: boolean; issuedAt: string | null }> {
  const row = await prisma.panelSetting.findUnique({
    where: { projectId_key: { projectId, key: BANLIST_KEY_SETTING } },
    select: { updatedAt: true },
  });
  return { enabled: !!row, issuedAt: row?.updatedAt.toISOString() ?? null };
}

function keyFromRequest(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim() || null;

  const header = req.headers.get('x-api-key');
  if (header) return header.trim() || null;

  // Для простых сайтов, где заголовок не поставить (виджеты, file_get_contents).
  const query = new URL(req.url).searchParams.get('key');
  return query?.trim() || null;
}

export function publicError(error: string, status: number, extra?: HeadersInit): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: { ...CORS_HEADERS, 'cache-control': 'no-store', ...extra } },
  );
}

/**
 * Находит проект по ключу из запроса. Возвращает готовую ошибку либо projectId.
 */
export async function requireBanlistKey(req: Request): Promise<string | NextResponse> {
  const key = keyFromRequest(req);
  if (!key || !key.startsWith(KEY_PREFIX)) return publicError('api key required', 401);

  const value = hashKey(key);

  const limit = rateLimit(`banlist:${value}`, LIMIT_PER_MIN);
  if (!limit.allowed) {
    return publicError('rate limit', 429, { 'retry-after': String(limit.retryAfterSec) });
  }

  const row = await prisma.panelSetting.findFirst({
    where: { key: BANLIST_KEY_SETTING, value },
    select: { projectId: true, project: { select: { accessExpiresAt: true } } },
  });
  if (!row) return publicError('invalid api key', 401);

  if (!accessStateOf(row.project.accessExpiresAt).active) {
    return publicError('project access expired', 402);
  }

  return row.projectId;
}
