import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getHighlightColor, listKeywords } from '@/lib/chat';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Удалить одно ключевое слово. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const deleted = await prisma.chatKeyword.deleteMany({ where: { id: params.id, projectId } });
  if (deleted.count === 0) {
    return NextResponse.json({ error: 'keyword not found' }, { status: 404 });
  }

  const [color, keywords] = await Promise.all([getHighlightColor(projectId), listKeywords(projectId)]);
  return NextResponse.json({ color, keywords });
}
