import { NextResponse } from 'next/server';
import { authenticateIngest, authErrorResponse } from '@/lib/ingestAuth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Подтверждение выполнения команды плагином. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await authenticateIngest(req);
  if (!auth.ok) return authErrorResponse(auth);

  const command = await prisma.serverCommand.findUnique({ where: { id: params.id } });
  if (!command || command.serverId !== auth.server.id) {
    return NextResponse.json({ error: 'command not found' }, { status: 404 });
  }

  await prisma.serverCommand.update({
    where: { id: command.id },
    data: { status: 'acked', ackedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
