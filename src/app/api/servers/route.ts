import { NextResponse } from 'next/server';
import { listServers } from '@/lib/overview';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Список серверов для одноимённого раздела. */
export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;

  const servers = await listServers();
  return NextResponse.json({ servers }, { headers: { 'cache-control': 'no-store' } });
}
