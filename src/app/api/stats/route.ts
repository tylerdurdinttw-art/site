import { NextResponse } from 'next/server';
import { getStats } from '@/lib/players';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const stats = await getStats(projectId);
  return NextResponse.json(stats, { headers: { 'cache-control': 'no-store' } });
}
