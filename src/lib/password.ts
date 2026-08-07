import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Параметры scrypt. N=16384 — примерно 60–100 мс на пароль на обычном VPS:
 * достаточно дорого для перебора и незаметно при входе.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

/**
 * Хэш пароля в виде "scrypt$N$r$p$salt$key" (обе половины — base64).
 * Отдельной зависимости вроде bcrypt не нужно: scrypt есть в самом Node.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

/** Сравнение постоянное по времени: по длительности ответа пароль не подобрать. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');

  try {
    const key = await scrypt(password, salt, expected.length, { N: n, r, p, maxmem: MAXMEM });
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}
