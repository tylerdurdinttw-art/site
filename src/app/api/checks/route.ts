import { NextResponse } from 'next/server';
import { listActiveChecks } from '@/lib/checks';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Активные проверки вместе с перепиской — по ним док рисует приватные чаты. */
export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;

  const checks = await listActiveChecks();
  return NextResponse.json({ checks }, { headers: { 'cache-control': 'no-store' } });
}
