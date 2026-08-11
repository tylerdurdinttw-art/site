import { NextResponse } from 'next/server';
import { getPositions } from '@/lib/positions';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const serverId = new URL(req.url).searchParams.get('serverId');
  if (!serverId) return NextResponse.json({ error: 'serverId is required' }, { status: 400 });

  const { at, players } = getPositions(serverId);

  return NextResponse.json(
    { at, players },
    { headers: { 'cache-control': 'no-store' } },
  );
}
