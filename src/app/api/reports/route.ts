import { NextResponse } from 'next/server';
import { deleteAllReports, listReportedPlayers } from '@/lib/reports';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

/** Игроки, на которых жаловались — по строке на игрока. */
export async function GET() {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const players = await listReportedPlayers(projectId);
  return NextResponse.json({ players }, { headers: noStore });
}

/** «Удалить все репорты» из настроек: чистит таблицу и обнуляет счётчики игроков. */
export async function DELETE() {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const deleted = await deleteAllReports(projectId);
  return NextResponse.json({ ok: true, deleted }, { headers: noStore });
}
