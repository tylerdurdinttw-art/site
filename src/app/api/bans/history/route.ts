import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Очистка истории банов в панели. Игровой сервер это не затрагивает:
 * забаненные остаются забаненными, панель просто забывает записи.
 * Чтобы действительно разбанить, нужен «Разбанить всех игроков».
 */
export async function DELETE() {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const removed = await prisma.ban.deleteMany({ where: { projectId } });
  return NextResponse.json({ ok: true, removed: removed.count });
}
