import { NextResponse } from 'next/server';
import { deleteAllReports, listReportedPlayers } from '@/lib/reports';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

/** Игроки, на которых жаловались — по строке на игрока. */
export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;

  const players = await listReportedPlayers();
  return NextResponse.json({ players }, { headers: noStore });
}

/** «Удалить все репорты» из настроек: чистит таблицу и обнуляет счётчики игроков. */
export async function DELETE() {
  const denied = await requireApiUser();
  if (denied) return denied;

  const deleted = await deleteAllReports();
  return NextResponse.json({ ok: true, deleted }, { headers: noStore });
}
