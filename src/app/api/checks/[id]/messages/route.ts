import { NextResponse } from 'next/server';
import { getCheckMessages } from '@/lib/checks';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Переписка завершённой проверки — раскрывается карточкой в списке. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const messages = await getCheckMessages(params.id);
  if (!messages) return NextResponse.json({ error: 'check not found' }, { status: 404 });

  return NextResponse.json({ messages }, { headers: { 'cache-control': 'no-store' } });
}
