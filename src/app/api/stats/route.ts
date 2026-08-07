import { NextResponse } from 'next/server';
import { getStats } from '@/lib/players';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;

  const stats = await getStats();
  return NextResponse.json(stats, { headers: { 'cache-control': 'no-store' } });
}
