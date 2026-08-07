import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Выход: строка сессии удаляется из базы, кука гасится. Логин в qp_login остаётся. */
export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
