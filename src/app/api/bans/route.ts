import { NextResponse } from 'next/server';
import { listBans } from '@/lib/bans';
import { isBanStatusFilter } from '@/lib/bansShared';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Список банов с фильтрами плюс счётчики по всей таблице. */
export async function GET(req: Request) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const params = new URL(req.url).searchParams;
  const status = params.get('status');

  const data = await listBans(projectId, {
    name: params.get('name')?.trim() ?? '',
    steamId: params.get('steamId')?.trim() ?? '',
    reason: params.get('reason')?.trim() ?? '',
    serverId: params.get('serverId') || 'all',
    status: isBanStatusFilter(status) ? status : 'active',
  });

  return NextResponse.json(data, { headers: { 'cache-control': 'no-store' } });
}
