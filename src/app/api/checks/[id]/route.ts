import { NextResponse } from 'next/server';
import { getCheckRoom } from '@/lib/checks';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Проверка целиком: шапка, состояние баннера и переписка — для страницы проверки. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const check = await getCheckRoom(params.id);
  if (!check) return NextResponse.json({ error: 'check not found' }, { status: 404 });

  return NextResponse.json({ check }, { headers: { 'cache-control': 'no-store' } });
}
