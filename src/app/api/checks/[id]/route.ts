import { NextResponse } from 'next/server';
import { getCheckRoom } from '@/lib/checks';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Проверка целиком: шапка, состояние баннера и переписка — для страницы проверки. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const check = await getCheckRoom(projectId, params.id);
  if (!check) return NextResponse.json({ error: 'check not found' }, { status: 404 });

  return NextResponse.json({ check }, { headers: { 'cache-control': 'no-store' } });
}
