import { NextResponse } from 'next/server';
import { listActiveChecks } from '@/lib/checks';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Активные проверки вместе с перепиской — по ним док рисует приватные чаты. */
export async function GET() {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const checks = await listActiveChecks(projectId);
  return NextResponse.json({ checks }, { headers: { 'cache-control': 'no-store' } });
}
