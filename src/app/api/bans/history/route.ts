import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Очистка истории банов в панели. Игровой сервер это не затрагивает:
 * забаненные остаются забаненными, панель просто забывает записи.
 * Чтобы действительно разбанить, нужен «Разбанить всех игроков».
 */
export async function DELETE() {
  const denied = await requireApiUser();
  if (denied) return denied;

  const removed = await prisma.ban.deleteMany({});
  return NextResponse.json({ ok: true, removed: removed.count });
}
