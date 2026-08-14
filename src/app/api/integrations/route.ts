import { NextResponse } from 'next/server';
import { getIntegrations, saveIntegrations } from '@/lib/integrations';
import { isDiscordWebhook } from '@/lib/integrationsShared';
import { isDenied, requireApiProject, requirePermission } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

export async function GET() {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;

  const denied = await requirePermission(ctx, 'settings');
  if (denied) return denied;

  return NextResponse.json(
    { integrations: await getIntegrations(ctx.projectId) },
    { headers: noStore },
  );
}

/** Привязка вебхука и переключатели уведомлений. */
export async function PATCH(req: Request) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;

  const denied = await requirePermission(ctx, 'settings');
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as {
    discord?: { webhookUrl?: unknown; reports?: unknown };
  };

  // Пустая строка — осознанная отвязка, всё остальное должно быть вебхуком Discord.
  const url = body.discord?.webhookUrl;
  if (typeof url === 'string' && url.trim() && !isDiscordWebhook(url)) {
    return NextResponse.json(
      { error: 'Это не похоже на вебхук Discord. Скопируйте адрес из настроек канала.' },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { integrations: await saveIntegrations(ctx.projectId, body) },
    { headers: noStore },
  );
}
