import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPairingCode, normalizeCode } from '@/lib/pairing';
import { rateLimit } from '@/lib/rateLimit';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Выдать новый код подключения.
 *
 * Авторизации в панели на этом этапе нет, поэтому эндпоинт открыт — как и вся панель.
 * Ограничиваем частоту, чтобы кодами нельзя было забить таблицу.
 */
export async function POST() {
  const denied = await requireApiUser();
  if (denied) return denied;

  const limit = rateLimit('pair:create', 20);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'too many codes' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSec) } },
    );
  }

  const created = await createPairingCode();

  return NextResponse.json(
    { code: created.code, expiresAt: created.expiresAt.toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
}

/** Состояние кода: UI опрашивает его, пока сервер не подключится. */
export async function GET(req: Request) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const raw = new URL(req.url).searchParams.get('code');
  if (!raw) return NextResponse.json({ error: 'code is required' }, { status: 400 });

  const row = await prisma.pairingCode.findUnique({ where: { code: normalizeCode(raw) } });
  if (!row) return NextResponse.json({ status: 'unknown' }, { headers: { 'cache-control': 'no-store' } });

  if (row.usedAt) {
    const server = row.serverId
      ? await prisma.server.findUnique({ where: { id: row.serverId } })
      : null;

    return NextResponse.json(
      { status: 'paired', serverId: row.serverId, serverName: server?.name ?? null },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  const status = row.expiresAt < new Date() ? 'expired' : 'pending';
  return NextResponse.json(
    { status, expiresAt: row.expiresAt.toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
