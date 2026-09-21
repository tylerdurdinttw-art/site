import { NextResponse } from 'next/server';
import { queueMute } from '@/lib/chat';
import {
  DEFAULT_MUTE_REASON,
  formatMuteDuration,
  MAX_MUTE_REASON_LENGTH,
  MAX_MUTE_SECONDS,
} from '@/lib/chatShared';
import { isDenied, requireApiProject, requirePermission } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

/** SteamID64: мутить по чему-то другому плагин Chat не умеет. */
const STEAM_ID = /^\d{17}$/;

interface Body {
  steamId?: unknown;
  serverId?: unknown;
  seconds?: unknown;
  reason?: unknown;
}

async function readTarget(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const steamId = String(body.steamId ?? '');
  const serverId = typeof body.serverId === 'string' ? body.serverId : '';
  return { body, steamId, serverId };
}

const offline = () =>
  NextResponse.json(
    { error: 'Сервер, где написано сообщение, не на связи — мут некуда отправить.' },
    { status: 409 },
  );

/** Мут автора сообщения из чата. Выдаёт его плагин Chat на сервере. Право «Муты». */
export async function POST(req: Request) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;

  const denied = await requirePermission(ctx, 'mute');
  if (denied) return denied;

  const { body, steamId, serverId } = await readTarget(req);
  if (!STEAM_ID.test(steamId) || !serverId) {
    return NextResponse.json({ error: 'Не указан игрок или сервер.' }, { status: 400 });
  }

  const seconds = Math.floor(Number(body.seconds));
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > MAX_MUTE_SECONDS) {
    return NextResponse.json(
      { error: `Срок — от 1 секунды до ${formatMuteDuration(MAX_MUTE_SECONDS)}.` },
      { status: 400 },
    );
  }

  // `|` отделяет срок от причины в очереди команд — в самой причине он не нужен.
  const reason =
    String(body.reason ?? '')
      .replace(/[|\r\n]/g, ' ')
      .trim()
      .slice(0, MAX_MUTE_REASON_LENGTH) || DEFAULT_MUTE_REASON;

  const queued = await queueMute(ctx.projectId, serverId, steamId, seconds, reason, ctx.user.login);
  if (!queued) return offline();

  return NextResponse.json({ ok: true, seconds, reason }, { headers: noStore });
}

/** Снять мут. Право то же — «Муты»: в описании права они идут парой. */
export async function DELETE(req: Request) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;

  const denied = await requirePermission(ctx, 'mute');
  if (denied) return denied;

  const { steamId, serverId } = await readTarget(req);
  if (!STEAM_ID.test(steamId) || !serverId) {
    return NextResponse.json({ error: 'Не указан игрок или сервер.' }, { status: 400 });
  }

  const queued = await queueMute(ctx.projectId, serverId, steamId, 0, '', ctx.user.login);
  if (!queued) return offline();

  return NextResponse.json({ ok: true }, { headers: noStore });
}
