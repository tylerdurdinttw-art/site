import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Server } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';

const MAX_SKEW_SEC = Number(process.env.INGEST_MAX_SKEW_SEC ?? 60);
const RATE_LIMIT_PER_MIN = Number(process.env.INGEST_RATE_LIMIT_PER_MIN ?? 60);

export type AuthFailure = { ok: false; status: number; error: string; retryAfterSec?: number };
export type AuthSuccess = { ok: true; server: Server; rawBody: string };
export type AuthResult = AuthFailure | AuthSuccess;

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

/**
 * Проверяет X-Server-Key / X-Timestamp / X-Signature и rate-limit.
 * Возвращает сырое тело — подпись считается именно от него, не от re-stringify JSON.
 */
export async function authenticateIngest(req: Request): Promise<AuthResult> {
  const serverKey = req.headers.get('x-server-key');
  const signature = req.headers.get('x-signature');
  const timestamp = req.headers.get('x-timestamp');

  if (!serverKey) return { ok: false, status: 401, error: 'missing X-Server-Key' };
  if (!signature) return { ok: false, status: 401, error: 'missing X-Signature' };
  if (!timestamp) return { ok: false, status: 401, error: 'missing X-Timestamp' };

  const limit = rateLimit(`ingest:${serverKey}`, RATE_LIMIT_PER_MIN);
  if (!limit.allowed) {
    return {
      ok: false,
      status: 429,
      error: 'rate limit exceeded',
      retryAfterSec: limit.retryAfterSec,
    };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, status: 401, error: 'bad X-Timestamp' };

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > MAX_SKEW_SEC) {
    return { ok: false, status: 401, error: 'stale request' };
  }

  const server = await prisma.server.findUnique({ where: { serverKey } });
  if (!server) return { ok: false, status: 401, error: 'unknown server key' };

  // Для GET тело пустое — подписывается пустая строка.
  const rawBody = req.method === 'GET' ? '' : await req.text();
  const expected = sign(rawBody, server.serverSecret);

  if (!safeEqualHex(expected, signature.toLowerCase())) {
    return { ok: false, status: 401, error: 'bad signature' };
  }

  return { ok: true, server, rawBody };
}

export function authErrorResponse(fail: AuthFailure): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (fail.retryAfterSec) headers['retry-after'] = String(fail.retryAfterSec);
  return new Response(JSON.stringify({ error: fail.error }), {
    status: fail.status,
    headers,
  });
}
