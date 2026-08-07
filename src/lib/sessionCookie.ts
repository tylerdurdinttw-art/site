/**
 * Формат и подпись куки сессии.
 *
 * Собран на Web Crypto, а не на node:crypto, специально: этот же код читает
 * middleware, а оно исполняется в edge-рантайме, где node-модулей нет.
 *
 * Значение куки: "<sid>.<secret>.<expMs>.<подпись>".
 *  - sid      — идентификатор строки в таблице sessions;
 *  - secret   — случайная половина, в базе лежит только её sha256;
 *  - expMs    — срок, чтобы middleware отсекало просрочку без похода в базу;
 *  - подпись  — HMAC-SHA256 первых трёх частей ключом AUTH_SECRET.
 *
 * Подделать куку без AUTH_SECRET нельзя, а по утечке базы нельзя восстановить secret.
 */

const encoder = new TextEncoder();

let cachedKey: Promise<CryptoKey> | null = null;
let cachedSecret: string | null = null;

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET не задан или короче 32 символов — сгенерируйте его перед запуском');
  }
  return secret;
}

function hmacKey(): Promise<CryptoKey> {
  const secret = authSecret();
  // Ключ импортируется один раз на процесс; пересобираем только если секрет подменили.
  if (!cachedKey || cachedSecret !== secret) {
    cachedSecret = secret;
    cachedKey = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
  }
  return cachedKey;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

/** Случайная строка из 32 байт — годится и для sid, и для секретной половины. */
export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** sha256 в hex — им хэшируются secret куки и токены из писем. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export interface CookiePayload {
  sid: string;
  secret: string;
  expiresAt: number;
}

export async function packCookie(payload: CookiePayload): Promise<string> {
  const body = `${payload.sid}.${payload.secret}.${payload.expiresAt}`;
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Проверяет подпись и срок. null — кука битая, чужая или просроченная;
 * что она относится к живой сессии, проверяет уже lib/auth.ts по базе.
 */
export async function unpackCookie(raw: string | undefined): Promise<CookiePayload | null> {
  if (!raw) return null;

  const parts = raw.split('.');
  if (parts.length !== 4) return null;

  const [sid, secret, expRaw, signature] = parts;
  const expiresAt = Number(expRaw);
  if (!sid || !secret || !Number.isFinite(expiresAt)) return null;
  if (expiresAt <= Date.now()) return null;

  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(),
      fromBase64Url(signature),
      encoder.encode(`${sid}.${secret}.${expRaw}`),
    );
  } catch {
    return null;
  }

  return valid ? { sid, secret, expiresAt } : null;
}
