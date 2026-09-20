import { NextResponse } from 'next/server';
import { isDenied, requireDeveloper } from '@/lib/apiAuth';
import {
  RUSTMAPS_API_KEY_SETTING,
  getRustMapsApiKey,
  getRustMapsKeyState,
  setAppSetting,
} from '@/lib/appSettings';
import { checkRustMapsKey } from '@/lib/rustmaps';
import { isRustMapsApiKey } from '@/lib/devShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

/**
 * Ключ rustmaps.com из раздела «Разработка». Устроен так же, как ключ Steam:
 * сам ключ наружу не отдаётся, только признак «задан» и последние символы.
 */
export async function GET() {
  const dev = await requireDeveloper();
  if (isDenied(dev)) return dev;

  return NextResponse.json({ rustmaps: await getRustMapsKeyState() }, { headers: noStore });
}

/** Сохранение ключа. Пустая строка — осознанное «стереть». */
export async function PUT(req: Request) {
  const dev = await requireDeveloper();
  if (isDenied(dev)) return dev;

  const body = (await req.json().catch(() => ({}))) as { key?: unknown };
  const key = typeof body.key === 'string' ? body.key.trim() : '';

  if (key && !isRustMapsApiKey(key)) {
    return NextResponse.json(
      { error: 'Ключ rustmaps — строка без пробелов, от 16 символов. Возьмите его в Dashboard → API keys.' },
      { status: 400 },
    );
  }

  await setAppSetting(RUSTMAPS_API_KEY_SETTING, key);

  return NextResponse.json({ rustmaps: await getRustMapsKeyState() }, { headers: noStore });
}

/**
 * Проверка ключа. Значение берётся из формы, если оно там похоже на ключ:
 * так кнопка работает на свежевставленном ключе, ещё до сохранения.
 */
export async function POST(req: Request) {
  const dev = await requireDeveloper();
  if (isDenied(dev)) return dev;

  const body = (await req.json().catch(() => ({}))) as { key?: unknown };
  const fromForm = typeof body.key === 'string' ? body.key.trim() : '';

  const key = isRustMapsApiKey(fromForm) ? fromForm : await getRustMapsApiKey();
  if (!key) return NextResponse.json({ error: 'Ключ не задан.' }, { status: 400 });

  const checked = await checkRustMapsKey(key);
  if (!checked.ok) {
    return NextResponse.json({ error: `Ключ не работает: ${checked.error}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true }, { headers: noStore });
}
