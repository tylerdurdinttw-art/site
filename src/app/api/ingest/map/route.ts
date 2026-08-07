import { NextResponse } from 'next/server';
import { authenticateIngest, authErrorResponse } from '@/lib/ingestAuth';
import { prisma } from '@/lib/prisma';
import { ensureRustMap } from '@/lib/rustmaps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 1024×1024 сэмплов — потолок, выше карта не нужна и тело запроса раздувается. */
const MAX_RESOLUTION = 1024;
const MIN_RESOLUTION = 64;

/**
 * Плагин спрашивает, нужна ли панели карта для текущего вайпа.
 * Ответ true — если карты нет вовсе либо сохранена от другого seed/размера.
 */
export async function GET(req: Request) {
  const auth = await authenticateIngest(req);
  if (!auth.ok) return authErrorResponse(auth);

  const url = new URL(req.url);
  const seed = Number(url.searchParams.get('seed'));
  const worldSize = Number(url.searchParams.get('size'));

  // Если карту отдаёт rustmaps, снимать рельеф на игровом сервере незачем.
  if (Number.isFinite(seed) && Number.isFinite(worldSize)) {
    const status = await ensureRustMap(seed, worldSize);
    if (status.state === 'ready' || status.state === 'generating') {
      return NextResponse.json(
        { needsUpload: false, source: 'rustmaps' },
        { headers: { 'cache-control': 'no-store' } },
      );
    }
  }

  const existing = await prisma.serverMap.findUnique({
    where: { serverId: auth.server.id },
    select: { seed: true, worldSize: true, resolution: true },
  });

  const needsUpload =
    !existing || existing.seed !== seed || existing.worldSize !== worldSize;

  return NextResponse.json(
    { needsUpload, resolution: existing?.resolution ?? null },
    { headers: { 'cache-control': 'no-store' } },
  );
}

interface MapBody {
  seed?: unknown;
  worldSize?: unknown;
  resolution?: unknown;
  minHeight?: unknown;
  maxHeight?: unknown;
  /** base64 от resolution² байт */
  heights?: unknown;
}

export async function POST(req: Request) {
  const auth = await authenticateIngest(req);
  if (!auth.ok) return authErrorResponse(auth);

  let body: MapBody;
  try {
    body = JSON.parse(auth.rawBody) as MapBody;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const seed = Number(body.seed);
  const worldSize = Number(body.worldSize);
  const resolution = Number(body.resolution);
  const minHeight = Number(body.minHeight);
  const maxHeight = Number(body.maxHeight);

  if (![seed, worldSize, resolution, minHeight, maxHeight].every(Number.isFinite)) {
    return NextResponse.json({ error: 'bad numeric fields' }, { status: 400 });
  }
  if (resolution < MIN_RESOLUTION || resolution > MAX_RESOLUTION) {
    return NextResponse.json({ error: 'resolution out of range' }, { status: 400 });
  }
  if (typeof body.heights !== 'string') {
    return NextResponse.json({ error: 'heights must be base64' }, { status: 400 });
  }

  const heights = Buffer.from(body.heights, 'base64');
  if (heights.length !== resolution * resolution) {
    return NextResponse.json(
      { error: `heights length ${heights.length}, expected ${resolution * resolution}` },
      { status: 400 },
    );
  }

  const data = {
    seed: Math.trunc(seed),
    worldSize: Math.trunc(worldSize),
    resolution: Math.trunc(resolution),
    minHeight,
    maxHeight,
    heights,
  };

  await prisma.serverMap.upsert({
    where: { serverId: auth.server.id },
    create: { serverId: auth.server.id, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true, bytes: heights.length });
}
