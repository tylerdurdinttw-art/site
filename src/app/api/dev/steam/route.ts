import { NextResponse } from 'next/server';
import { isDenied, requireDeveloper } from '@/lib/apiAuth';
import { STEAM_API_KEY_SETTING, getSteamApiKey, getSteamKeyState, setAppSetting } from '@/lib/appSettings';
import { checkSteamKey } from '@/lib/steam';
import { isSteamApiKey } from '@/lib/devShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

/**
 * Ключ Steam Web API из раздела «Разработка». Сам ключ наружу не отдаётся
 * никогда — только признак «задан» и последние четыре символа.
 */
export async function GET() {
  const dev = await requireDeveloper();
  if (isDenied(dev)) return dev;

  return NextResponse.json({ steam: await getSteamKeyState() }, { headers: noStore });
}

/** Сохранение ключа. Пустая строка — осознанное «стереть». */
export async function PUT(req: Request) {
  const dev = await requireDeveloper();
  if (isDenied(dev)) return dev;

  const body = (await req.json().catch(() => ({}))) as { key?: unknown };
  const key = typeof body.key === 'string' ? body.key.trim() : '';

  if (key && !isSteamApiKey(key)) {
    return NextResponse.json(
      { error: 'Ключ Steam — 32 символа из цифр и букв A–F. Возьмите его на steamcommunity.com/dev/apikey.' },
      { status: 400 },
    );
  }

  await setAppSetting(STEAM_API_KEY_SETTING, key);

  return NextResponse.json({ steam: await getSteamKeyState() }, { headers: noStore });
}

/**
 * Проверка ключа. Значение берётся из формы, если оно там валидное: так кнопка
 * работает на свежевставленном ключе, до сохранения.
 */
export async function POST(req: Request) {
  const dev = await requireDeveloper();
  if (isDenied(dev)) return dev;

  const body = (await req.json().catch(() => ({}))) as { key?: unknown };
  const fromForm = typeof body.key === 'string' ? body.key.trim() : '';

  const key = isSteamApiKey(fromForm) ? fromForm : await getSteamApiKey();
  if (!key) return NextResponse.json({ error: 'Ключ не задан.' }, { status: 400 });

  const checked = await checkSteamKey(key);
  if (!checked.ok) {
    return NextResponse.json({ error: `Ключ не работает: ${checked.error}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true }, { headers: noStore });
}
