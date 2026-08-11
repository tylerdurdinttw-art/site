import { NextResponse } from 'next/server';
import { getCheckMessages } from '@/lib/checks';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Переписка завершённой проверки — раскрывается карточкой в списке. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const messages = await getCheckMessages(projectId, params.id);
  if (!messages) return NextResponse.json({ error: 'check not found' }, { status: 404 });

  return NextResponse.json({ messages }, { headers: { 'cache-control': 'no-store' } });
}
