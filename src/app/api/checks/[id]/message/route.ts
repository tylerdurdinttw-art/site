import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findCheck, queueCommand } from '@/lib/checks';
import { MAX_CHECK_MESSAGE_LENGTH } from '@/lib/checksShared';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Личное сообщение проверяемому: команда check_pm уходит плагину, тот пишет
 * только этому игроку. В чате панели сообщение появляется сразу.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const check = await findCheck(projectId, params.id);
  if (!check) return NextResponse.json({ error: 'check not found' }, { status: 404 });
  if (check.status !== 'active') {
    return NextResponse.json({ error: 'Проверка уже завершена.' }, { status: 409 });
  }

  let body: { text?: unknown };
  try {
    body = (await req.json()) as { text?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: 'Сообщение пустое.' }, { status: 400 });

  const trimmed = text.slice(0, MAX_CHECK_MESSAGE_LENGTH);

  const message = await prisma.checkMessage.create({
    data: { checkId: check.id, from: 'panel', text: trimmed },
  });

  await queueCommand(projectId, check.serverId, 'check_pm', check.steamId, trimmed);

  return NextResponse.json({ ok: true, messageId: message.id });
}
