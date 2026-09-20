import { NextResponse } from 'next/server';
import { getAvatarImage } from '@/lib/steam';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Аватар игрока из кеша панели.
 *
 * Браузеру мы отдаём эту ссылку вместо прямой на CDN Steam: оттуда картинки
 * приходят не из каждой сети и заметно медленнее, из-за чего в списках аватарки
 * то появлялись, то нет. Картинка скачивается один раз и дальше живёт в базе.
 *
 * Нет ключа Steam, закрытый профиль, битый SteamID — 404, и Avatar рисует
 * первую букву ника.
 */
export async function GET(_req: Request, { params }: { params: { steamId: string } }) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const avatar = await getAvatarImage(params.steamId);
  if (!avatar) {
    return NextResponse.json({ error: 'avatar not found' }, { status: 404 });
  }

  return new Response(new Uint8Array(avatar.image), {
    headers: {
      'content-type': avatar.contentType,
      'content-length': String(avatar.image.length),
      // Кука в запросе есть, поэтому кеш только браузерный — общий прокси такое не кеширует.
      'cache-control': 'private, max-age=86400',
    },
  });
}
