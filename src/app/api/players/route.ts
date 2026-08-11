import { NextResponse } from 'next/server';
import { listPlayers } from '@/lib/players';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Без пагинации и фильтров — по ТЗ первого этапа.
export async function GET() {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const players = await listPlayers(projectId);
  return NextResponse.json({ players }, { headers: { 'cache-control': 'no-store' } });
}
