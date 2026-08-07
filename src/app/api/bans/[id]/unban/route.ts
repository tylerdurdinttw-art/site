import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { queueCommand } from '@/lib/checks';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Снятие одного бана: помечает запись снятой и ставит плагину `unban`,
 * иначе игрок останется в бан-листе игрового сервера.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const ban = await prisma.ban.findUnique({ where: { id: params.id } });
  if (!ban) return NextResponse.json({ error: 'ban not found' }, { status: 404 });
  if (!ban.active) {
    return NextResponse.json({ error: 'Бан уже снят.' }, { status: 409 });
  }

  await prisma.ban.update({
    where: { id: ban.id },
    data: { active: false, unbannedAt: new Date() },
  });

  await queueCommand(ban.serverId, 'unban', ban.steamId, '');

  return NextResponse.json({ ok: true });
}
