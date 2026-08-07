import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { queueCommand } from '@/lib/checks';
import { getSettings } from '@/lib/settings';
import { CHECK_INVITE_MESSAGE } from '@/lib/checksShared';
import { PANEL_ADMIN } from '@/lib/bansShared';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Вызов на проверку: заводит проверку (приватный чат с игроком) и кладёт в очередь
 * команду `check` — плагин показывает игроку предупреждение на экране.
 * Команда уходит на сервер, где игрок был замечен последним.
 */

/** Сервер считается живым, если heartbeat приходил не позже этого срока. */
const SERVER_ALIVE_SEC = 120;

export async function POST(_req: Request, { params }: { params: { steamId: string } }) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const player = await prisma.player.findUnique({
    where: { steamId: params.steamId },
    include: { server: true },
  });

  if (!player) {
    return NextResponse.json({ error: 'player not found' }, { status: 404 });
  }

  // Проверка уже идёт — второй чат не заводим, просто возвращаем текущую.
  const running = await prisma.playerCheck.findFirst({
    where: { steamId: player.steamId, status: 'active' },
  });
  if (running) {
    return NextResponse.json({
      ok: true,
      checkId: running.id,
      alreadyRunning: true,
      message: 'Проверка уже идёт — чат открыт ниже.',
    });
  }

  if (!player.serverId || !player.server) {
    return NextResponse.json(
      { error: 'Игрок не привязан ни к одному серверу — вызвать некуда.' },
      { status: 409 },
    );
  }
  if (player.status === 'offline') {
    return NextResponse.json(
      { error: 'Игрок не в сети — он не увидит предупреждение.' },
      { status: 409 },
    );
  }

  // «Минимальное кол-во жалоб для начала проверки» из настроек.
  const settings = await getSettings();
  if (player.reportsCount < settings.checks.minReports) {
    return NextResponse.json(
      {
        error: `Проверку можно начать, когда на игрока пожалуются ${settings.checks.minReports} раз. Сейчас жалоб: ${player.reportsCount}.`,
      },
      { status: 409 },
    );
  }

  const heartbeat = player.server.lastHeartbeatAt?.getTime() ?? 0;
  if (Date.now() - heartbeat > SERVER_ALIVE_SEC * 1000) {
    return NextResponse.json(
      { error: 'Сервер не отвечает — команда не дойдёт до плагина.' },
      { status: 409 },
    );
  }

  // Команда `check` сразу показывает баннер на весь экран и дублирует вызов в чат,
  // поэтому проверка стартует с уже поднятым баннером — отдельная кнопка не нужна.
  const check = await prisma.playerCheck.create({
    data: {
      serverId: player.serverId,
      playerId: player.id,
      steamId: player.steamId,
      name: player.name,
      admin: PANEL_ADMIN,
      bannerVisible: true,
    },
  });

  await queueCommand(player.serverId, 'check', player.steamId, CHECK_INVITE_MESSAGE);

  // «Оповещение о начале проверки игрока в чате» — видит весь сервер.
  if (settings.checks.announceStart) {
    await queueCommand(
      player.serverId,
      'check_announce',
      player.steamId,
      `Игрок ${player.name} вызван на проверку`,
    );
  }

  await prisma.player.update({
    where: { id: player.id },
    data: { checkRequestedAt: new Date() },
  });

  return NextResponse.json({ ok: true, checkId: check.id, message: CHECK_INVITE_MESSAGE });
}
