import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureRustMap, getCachedImage, mapKey } from '@/lib/rustmaps';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Картинка карты для сервера. Отдаётся из кеша в базе;
 * при первом обращении панель скачивает её с rustmaps и сохраняет.
 */
export async function GET(req: Request) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const serverId = new URL(req.url).searchParams.get('serverId');
  if (!serverId) return NextResponse.json({ error: 'serverId is required' }, { status: 400 });

  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { seed: true, worldSize: true },
  });
  const terrain = await prisma.serverMap.findUnique({
    where: { serverId },
    select: { seed: true, worldSize: true },
  });

  // seed из heartbeat, а у старых версий плагина — из загруженного рельефа.
  const seed = server?.seed ?? terrain?.seed ?? null;
  const worldSize = server?.worldSize ?? terrain?.worldSize ?? null;

  if (!seed || !worldSize) {
    return NextResponse.json({ error: 'seed/size сервера неизвестны' }, { status: 404 });
  }

  const key = mapKey(seed, worldSize);
  let cached = await getCachedImage(key);

  if (!cached) {
    const status = await ensureRustMap(seed, worldSize);
    if (status.state !== 'ready') {
      return NextResponse.json({ error: status.state }, { status: 404 });
    }
    cached = await getCachedImage(key);
    if (!cached) return NextResponse.json({ error: 'image missing' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(cached.image), {
    headers: {
      'content-type': cached.contentType,
      // Карта меняется только с вайпом, ключ кеша включает seed и размер.
      'cache-control': 'private, max-age=86400',
    },
  });
}
