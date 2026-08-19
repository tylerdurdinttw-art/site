import { NextResponse } from 'next/server';
import { authenticateIngest, authErrorResponse } from '@/lib/ingestAuth';
import { prisma } from '@/lib/prisma';
import type { PanelCommand } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Очередь команд панель -> плагин. Заготовка: панель на этом этапе ничего в неё не кладёт,
 * поэтому плагин штатно получает пустой список.
 */
export async function GET(req: Request) {
  const auth = await authenticateIngest(req);
  if (!auth.ok) return authErrorResponse(auth);

  const rows = await prisma.serverCommand.findMany({
    where: { serverId: auth.server.id, status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  if (rows.length) {
    await prisma.serverCommand.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { status: 'sent', sentAt: new Date() },
    });
  }

  const commands: PanelCommand[] = rows.map((r) => ({
    id: r.id,
    type: r.type as PanelCommand['type'],
    steamId: r.steamId,
    reason: r.reason,
    admin: r.admin,
  }));

  return NextResponse.json({ commands }, { headers: { 'cache-control': 'no-store' } });
}
