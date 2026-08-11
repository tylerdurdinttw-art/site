import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureRustMap } from '@/lib/rustmaps';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Сервер считается онлайн, если heartbeat приходил не дольше двух интервалов назад. */
const SERVER_ONLINE_WINDOW_MS = 90_000;

/**
 * Без `serverId` — список серверов.
 * С `serverId` — описание карты: либо картинка с rustmaps, либо запасная сетка высот.
 */
export async function GET(req: Request) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const serverId = new URL(req.url).searchParams.get('serverId');
  const since = new Date(Date.now() - SERVER_ONLINE_WINDOW_MS);

  if (!serverId) {
    const servers = await prisma.server.findMany({
      where: { projectId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, lastHeartbeatAt: true, seed: true, worldSize: true },
    });

    return NextResponse.json(
      {
        servers: servers.map((s) => ({
          id: s.id,
          name: s.name,
          online: Boolean(s.lastHeartbeatAt && s.lastHeartbeatAt >= since),
          seed: s.seed,
          worldSize: s.worldSize,
        })),
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  const server = await prisma.server.findFirst({
    where: { id: serverId, projectId },
    select: { id: true, name: true, seed: true, worldSize: true },
  });
  if (!server) return NextResponse.json({ error: 'server not found' }, { status: 404 });

  const terrain = await prisma.serverMap.findUnique({ where: { serverId } });

  // seed приходит в heartbeat, но у старых версий плагина его нет —
  // тогда берём его из уже загруженного рельефа.
  const seed = server.seed ?? terrain?.seed ?? null;
  const worldSize = server.worldSize ?? terrain?.worldSize ?? null;

  // Основной источник — rustmaps по seed + размеру мира.
  if (seed && worldSize) {
    const status = await ensureRustMap(seed, worldSize);

    if (status.state === 'ready') {
      return NextResponse.json(
        {
          source: 'rustmaps',
          serverId: server.id,
          seed,
          worldSize,
          imageUrl: `/api/map/image?serverId=${encodeURIComponent(server.id)}`,
        },
        { headers: { 'cache-control': 'no-store' } },
      );
    }

    // Карта ещё генерируется на стороне rustmaps — запасной вариант не нужен, просто подождём.
    if (status.state === 'generating' && !terrain) {
      return NextResponse.json(
        { source: 'pending', serverId: server.id, seed, worldSize },
        { headers: { 'cache-control': 'no-store' } },
      );
    }

    if (!terrain) {
      return NextResponse.json(
        {
          source: 'unavailable',
          serverId,
          seed,
          worldSize,
          reason: status.state,
          message: 'message' in status ? status.message : null,
        },
        { headers: { 'cache-control': 'no-store' } },
      );
    }
  }

  // Запасной вариант: рельеф, снятый плагином.
  if (terrain) {
    return NextResponse.json(
      {
        source: 'terrain',
        serverId,
        seed: terrain.seed,
        worldSize: terrain.worldSize,
        resolution: terrain.resolution,
        minHeight: terrain.minHeight,
        maxHeight: terrain.maxHeight,
        heights: Buffer.from(terrain.heights).toString('base64'),
      },
      { headers: { 'cache-control': 'private, max-age=300' } },
    );
  }

  return NextResponse.json(
    { source: 'unavailable', serverId, reason: 'no_seed', message: 'сервер ещё не сообщил seed карты' },
    { headers: { 'cache-control': 'no-store' } },
  );
}
