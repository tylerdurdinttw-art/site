import { NextResponse } from 'next/server';
import { listServers } from '@/lib/overview';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Список серверов для одноимённого раздела. */
export async function GET() {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const servers = await listServers(projectId);
  return NextResponse.json({ servers }, { headers: { 'cache-control': 'no-store' } });
}
