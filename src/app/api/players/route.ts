import { NextResponse } from 'next/server';
import { listPlayers } from '@/lib/players';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Без пагинации и фильтров — по ТЗ первого этапа.
export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;

  const players = await listPlayers();
  return NextResponse.json({ players }, { headers: { 'cache-control': 'no-store' } });
}
