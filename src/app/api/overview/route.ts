import { NextResponse } from 'next/server';
import { getOverview, listServers } from '@/lib/overview';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;

  const [overview, servers] = await Promise.all([getOverview(), listServers()]);
  return NextResponse.json(
    { ...overview, servers },
    { headers: { 'cache-control': 'no-store' } },
  );
}
