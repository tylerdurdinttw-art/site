import { NextResponse } from 'next/server';
import { getOverview, listServers } from '@/lib/overview';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const [overview, servers] = await Promise.all([getOverview(projectId), listServers(projectId)]);
  return NextResponse.json(
    { ...overview, servers },
    { headers: { 'cache-control': 'no-store' } },
  );
}
