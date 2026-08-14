import { NextResponse } from 'next/server';
import { getIntegrations, notifyTest } from '@/lib/integrations';
import { isDiscordWebhook, type DiscordChannelKey } from '@/lib/integrationsShared';
import { isDenied, requireApiProject, requirePermission } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Проверочное сообщение в канал. Адрес берётся из формы, если он там валидный:
 * так кнопка «Отправить тест» работает до сохранения, на свежевставленном вебхуке.
 */
export async function POST(req: Request) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;

  const denied = await requirePermission(ctx, 'settings');
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { webhookUrl?: unknown; channel?: unknown };
  const fromForm = typeof body.webhookUrl === 'string' ? body.webhookUrl.trim() : '';
  const channel: DiscordChannelKey = body.channel === 'bans' ? 'bans' : 'reports';

  const webhookUrl = isDiscordWebhook(fromForm)
    ? fromForm
    : (await getIntegrations(ctx.projectId)).discord[channel].webhookUrl;

  if (!webhookUrl) {
    return NextResponse.json({ error: 'Вебхук не привязан.' }, { status: 400 });
  }

  const sent = await notifyTest(webhookUrl, channel);
  if (!sent.ok) {
    return NextResponse.json({ error: `Не доставлено: ${sent.error}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
