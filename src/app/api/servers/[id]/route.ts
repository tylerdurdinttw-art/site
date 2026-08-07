import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Удаление сервера из панели. Вместе с записью уходят его сессии, события,
 * репорты, баны, проверки и очередь команд — так настроены каскады в схеме.
 * У игроков сервер просто обнуляется, сами игроки остаются.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const server = await prisma.server.findUnique({ where: { id: params.id } });
  if (!server) return NextResponse.json({ error: 'server not found' }, { status: 404 });

  await prisma.server.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
