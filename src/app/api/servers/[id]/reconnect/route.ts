import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPairingCode } from '@/lib/pairing';
import { rateLimit } from '@/lib/rateLimit';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Код переподключения: привязан к этому серверу, поэтому обмен перевыдаст ключи
 * существующей записи, а не заведёт новую. Данные и баны сервера сохраняются.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
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

  const server = await prisma.server.findFirst({ where: { id: params.id, projectId } });
  if (!server) return NextResponse.json({ error: 'server not found' }, { status: 404 });

  const created = await createPairingCode(projectId, server.id);

  return NextResponse.json(
    { code: created.code, expiresAt: created.expiresAt.toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
