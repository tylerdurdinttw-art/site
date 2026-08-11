import { NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/settings';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

/** Настройки модерации целиком: раздел рисует по ним все три вкладки. */
export async function GET() {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  return NextResponse.json({ settings: await getSettings(projectId) }, { headers: noStore });
}

/** Браузер шлёт только изменённую секцию; остальное берётся из текущих настроек. */
export async function PATCH(req: Request) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const settings = await saveSettings(projectId, body);
  return NextResponse.json({ settings }, { headers: noStore });
}
