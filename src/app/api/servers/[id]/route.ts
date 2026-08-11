import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Удаление сервера из панели. Вместе с записью уходят его сессии, события,
 * репорты, баны, проверки и очередь команд — так настроены каскады в схеме.
 * У игроков сервер просто обнуляется, сами игроки остаются.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const server = await prisma.server.findFirst({ where: { id: params.id, projectId } });
  if (!server) return NextResponse.json({ error: 'server not found' }, { status: 404 });

  await prisma.server.delete({ where: { id: server.id } });
  // Рельеф лежит отдельной таблицей без внешнего ключа — каскад его не заденет.
  await prisma.serverMap.deleteMany({ where: { serverId: server.id } });

  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
