import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPairingCode } from '@/lib/pairing';
import { rateLimit } from '@/lib/rateLimit';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Код переподключения: привязан к этому серверу, поэтому обмен перевыдаст ключи
 * существующей записи, а не заведёт новую. Данные и баны сервера сохраняются.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const limit = rateLimit('pair:create', 20);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'too many codes' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSec) } },
    );
  }

  const server = await prisma.server.findUnique({ where: { id: params.id } });
  if (!server) return NextResponse.json({ error: 'server not found' }, { status: 404 });

  const created = await createPairingCode(server.id);

  return NextResponse.json(
    { code: created.code, expiresAt: created.expiresAt.toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
