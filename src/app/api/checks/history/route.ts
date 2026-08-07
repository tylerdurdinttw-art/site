import { NextResponse } from 'next/server';
import { listCheckHistory } from '@/lib/checks';
import { isCheckHistoryFilter } from '@/lib/checksShared';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Список всех проверок для раздела «Проверки». */
export async function GET(req: Request) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const filter = new URL(req.url).searchParams.get('filter');
  const checks = await listCheckHistory(isCheckHistoryFilter(filter) ? filter : 'all');

  return NextResponse.json({ checks }, { headers: { 'cache-control': 'no-store' } });
}
