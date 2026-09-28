import { NextResponse } from 'next/server';
import { canManageProjectUser } from '@/lib/project';
import { isDenied, requireApiProject, type ApiContext } from '@/lib/apiAuth';
import { banlistKeyState, issueBanlistKey, revokeBanlistKey } from '@/lib/publicApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

/** Ключ API открывает бан-лист наружу — управлять им могут только владельцы. */
async function requireManager(): Promise<ApiContext | NextResponse> {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  if (!(await canManageProjectUser(ctx.projectId, ctx.user.id, ctx.user.login))) {
    return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
  }
  return ctx;
}

export async function GET() {
  const ctx = await requireManager();
  if (isDenied(ctx)) return ctx;
  return NextResponse.json(await banlistKeyState(ctx.projectId), { headers: noStore });
}

/** Выпуск или перевыпуск: старый ключ перестаёт работать сразу. */
export async function POST() {
  const ctx = await requireManager();
  if (isDenied(ctx)) return ctx;

  const key = await issueBanlistKey(ctx.projectId);
  const state = await banlistKeyState(ctx.projectId);
  return NextResponse.json({ ...state, key }, { headers: noStore });
}

export async function DELETE() {
  const ctx = await requireManager();
  if (isDenied(ctx)) return ctx;

  await revokeBanlistKey(ctx.projectId);
  return NextResponse.json(await banlistKeyState(ctx.projectId), { headers: noStore });
}
