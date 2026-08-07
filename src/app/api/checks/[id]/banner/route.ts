import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { queueCommand } from '@/lib/checks';
import { BANNER_TEXT } from '@/lib/checksShared';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Баннер на весь экран игрока: { show: true } — показать, { show: false } — убрать. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const check = await prisma.playerCheck.findUnique({ where: { id: params.id } });
  if (!check) return NextResponse.json({ error: 'check not found' }, { status: 404 });
  if (check.status !== 'active') {
    return NextResponse.json({ error: 'Проверка уже завершена.' }, { status: 409 });
  }

  let body: { show?: unknown };
  try {
    body = (await req.json()) as { show?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const show = body.show !== false;

  await queueCommand(
    check.serverId,
    show ? 'check_banner' : 'check_banner_hide',
    check.steamId,
    show ? BANNER_TEXT : '',
  );

  await prisma.playerCheck.update({
    where: { id: check.id },
    data: { bannerVisible: show },
  });

  return NextResponse.json({ ok: true, bannerVisible: show });
}
