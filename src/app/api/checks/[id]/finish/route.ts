import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { queueCommand } from '@/lib/checks';
import { dropReportsFor } from '@/lib/reports';
import { getSettings } from '@/lib/settings';
import {
  MAX_CHECK_REASON_LENGTH,
  PASSED_REASON,
  TEAM_BAN_REASON,
  checkResultMessages,
  isCheckOutcome,
} from '@/lib/checksShared';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Завершение проверки: снимает баннер, закрывает приватный чат и,
 * если исход — бан, ставит плагину команду на блокировку.
 * Записи в таблицу банов панель не делает: плагин пришлёт player_banned сам.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const check = await prisma.playerCheck.findUnique({ where: { id: params.id } });
  if (!check) return NextResponse.json({ error: 'check not found' }, { status: 404 });
  if (check.status !== 'active') {
    return NextResponse.json({ error: 'Проверка уже завершена.' }, { status: 409 });
  }

  let body: { outcome?: unknown; reason?: unknown };
  try {
    body = (await req.json()) as { outcome?: unknown; reason?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const { outcome } = body;
  if (!isCheckOutcome(outcome)) {
    return NextResponse.json({ error: 'Неизвестный исход проверки.' }, { status: 400 });
  }

  const given = typeof body.reason === 'string' ? body.reason.trim() : '';

  // У «прошёл проверку» и бана тимы текст причины зафиксирован.
  let reason: string;
  if (outcome === 'passed') {
    reason = PASSED_REASON;
  } else if (outcome === 'team_ban') {
    reason = TEAM_BAN_REASON;
  } else {
    if (!given) {
      return NextResponse.json({ error: 'Нужно указать причину.' }, { status: 400 });
    }
    reason = given.slice(0, MAX_CHECK_REASON_LENGTH);
  }

  const settings = await getSettings();
  const result = checkResultMessages(outcome, reason, check.name);

  // Порядок важен: итог игрок должен прочитать до того, как его отключит бан.
  await queueCommand(check.serverId, 'check_result', check.steamId, result.player);
  if (result.broadcast) {
    await queueCommand(check.serverId, 'check_announce', check.steamId, result.broadcast);
  } else if (outcome === 'passed' && settings.checks.announceFinish) {
    // «Оповещение в чате о завершении проверки»: нарушений нет — говорим об этом всем.
    await queueCommand(
      check.serverId,
      'check_announce',
      check.steamId,
      `Игрок ${check.name} прошёл проверку`,
    );
  }

  if (outcome === 'ban') {
    await queueCommand(check.serverId, 'ban', check.steamId, reason);
  } else if (outcome === 'team_ban') {
    await queueCommand(check.serverId, 'ban_team', check.steamId, reason);
  }

  // Снимает баннер с экрана и выводит игрока из списка «под проверкой» в плагине.
  await queueCommand(check.serverId, 'check_end', check.steamId, '');

  // Итог остаётся в переписке проверки — видно, что именно ушло игроку.
  await prisma.checkMessage.create({
    data: { checkId: check.id, from: 'panel', text: result.player },
  });

  await prisma.playerCheck.update({
    where: { id: check.id },
    data: {
      status: 'finished',
      bannerVisible: false,
      outcome,
      reason,
      finishedAt: new Date(),
    },
  });

  // «Удалять репорты после проверки»: игрока разобрали, старые жалобы больше не нужны.
  if (settings.reports.deleteAfterCheck) await dropReportsFor(check.steamId);

  return NextResponse.json({ ok: true, outcome, reason });
}
