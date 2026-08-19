import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { queueCommand } from '@/lib/checks';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Снятие одного бана: помечает запись снятой и ставит плагину `unban`,
 * иначе игрок останется в бан-листе игрового сервера.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const ban = await prisma.ban.findUnique({ where: { id: params.id } });
  // Чужой бан для этого проекта не существует — отвечаем так же, как на выдуманный id.
  if (!ban || ban.projectId !== projectId) {
    return NextResponse.json({ error: 'ban not found' }, { status: 404 });
  }
  if (!ban.active) {
    return NextResponse.json({ error: 'Бан уже снят.' }, { status: 409 });
  }

  await prisma.ban.update({
    where: { id: ban.id },
    data: { active: false, unbannedAt: new Date() },
  });

  await queueCommand(projectId, ban.serverId, 'unban', ban.steamId, '', ctx.user.login);

  return NextResponse.json({ ok: true });
}
