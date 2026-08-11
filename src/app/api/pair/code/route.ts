import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPairingCode, normalizeCode } from '@/lib/pairing';
import { rateLimit } from '@/lib/rateLimit';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Выдать новый код подключения. Код привязан к проекту того, кто его запросил:
 * сервер, обменявший код, попадёт именно в этот проект.
 * Частоту ограничиваем, чтобы кодами нельзя было забить таблицу.
 */
export async function POST() {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const limit = rateLimit('pair:create', 20);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'too many codes' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSec) } },
    );
  }

  const created = await createPairingCode(projectId);

  return NextResponse.json(
    { code: created.code, expiresAt: created.expiresAt.toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
}

/** Состояние кода: UI опрашивает его, пока сервер не подключится. */
export async function GET(req: Request) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const raw = new URL(req.url).searchParams.get('code');
  if (!raw) return NextResponse.json({ error: 'code is required' }, { status: 400 });

  const row = await prisma.pairingCode.findFirst({
    where: { code: normalizeCode(raw), projectId },
  });
  if (!row) {
    return NextResponse.json({ status: 'unknown' }, { headers: { 'cache-control': 'no-store' } });
  }

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
