import { NextResponse } from 'next/server';
import { getPlayerDetails } from '@/lib/players';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Карточка игрока для модального окна на странице «Игроки». */
export async function GET(_req: Request, { params }: { params: { steamId: string } }) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const details = await getPlayerDetails(params.steamId);
  if (!details) {
    return NextResponse.json({ error: 'player not found' }, { status: 404 });
  }

  return NextResponse.json(details, { headers: { 'cache-control': 'no-store' } });
}
