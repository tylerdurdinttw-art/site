import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getHighlightColor, listKeywords } from '@/lib/chat';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Удалить одно ключевое слово. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const deleted = await prisma.chatKeyword.deleteMany({ where: { id: params.id } });
  if (deleted.count === 0) {
    return NextResponse.json({ error: 'keyword not found' }, { status: 404 });
  }

  const [color, keywords] = await Promise.all([getHighlightColor(), listKeywords()]);
  return NextResponse.json({ color, keywords });
}
