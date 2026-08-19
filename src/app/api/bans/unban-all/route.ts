import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { queueCommand } from '@/lib/checks';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Массовый разбан: снимает все активные баны и ставит по команде `unban` на каждого,
 * чтобы бан-лист игрового сервера совпал с панелью.
 */
export async function POST() {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const active = await prisma.ban.findMany({
    where: { projectId, active: true },
    select: { id: true, serverId: true, steamId: true },
  });

  if (active.length === 0) {
    return NextResponse.json({ ok: true, unbanned: 0 });
  }

  await prisma.ban.updateMany({
    where: { id: { in: active.map((b) => b.id) } },
    data: { active: false, unbannedAt: new Date() },
  });

  // Один и тот же SteamID может числиться забаненным на нескольких серверах —
  // команда нужна каждому из них, поэтому пара сервер+игрок, а не только игрок.
  const seen = new Set<string>();
  for (const ban of active) {
    const key = `${ban.serverId}:${ban.steamId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await queueCommand(projectId, ban.serverId, 'unban', ban.steamId, '', ctx.user.login);
  }

  return NextResponse.json({ ok: true, unbanned: active.length });
}
