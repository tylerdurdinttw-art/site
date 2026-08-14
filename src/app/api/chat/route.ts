import { NextResponse } from 'next/server';
import { isAnyServerConnected, listChatMessages, sendChatMessage } from '@/lib/chat';
import { MAX_CHAT_MESSAGE_LENGTH } from '@/lib/chatShared';
import { isDenied, requireApiProject, requirePermission } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

export async function GET() {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const [connected, messages] = await Promise.all([isAnyServerConnected(projectId), listChatMessages(projectId)]);
  return NextResponse.json({ connected, messages }, { headers: noStore });
}

/** Сообщение из панели в игровой чат. Требует права «Чат». */
export async function POST(req: Request) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;

  const denied = await requirePermission(ctx, 'chat');
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { message?: unknown; serverId?: unknown };

  const message = String(body.message ?? '').trim();
  if (!message) return NextResponse.json({ error: 'Сообщение пустое.' }, { status: 400 });
  if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Не длиннее ${MAX_CHAT_MESSAGE_LENGTH} символов.` },
      { status: 400 },
    );
  }

  const serverId = typeof body.serverId === 'string' && body.serverId ? body.serverId : null;

  const sent = await sendChatMessage(ctx.projectId, ctx.user.login, message, serverId);
  if (sent === 0) {
    return NextResponse.json(
      { error: 'Ни один сервер не на связи — сообщение некуда отправить.' },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, servers: sent }, { headers: noStore });
}
