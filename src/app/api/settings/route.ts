import { NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/settings';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

/** Настройки модерации целиком: раздел рисует по ним все три вкладки. */
export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;

  return NextResponse.json({ settings: await getSettings() }, { headers: noStore });
}

/** Браузер шлёт только изменённую секцию; остальное берётся из текущих настроек. */
export async function PATCH(req: Request) {
  const denied = await requireApiUser();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const settings = await saveSettings(body);
  return NextResponse.json({ settings }, { headers: noStore });
}
