import { NextResponse } from 'next/server';
import { authenticateIngest, authErrorResponse } from '@/lib/ingestAuth';
import { setPositions, type PlayerPosition } from '@/lib/positions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface IncomingPlayer {
  steamId?: unknown;
  name?: unknown;
  x?: unknown;
  y?: unknown;
  z?: unknown;
  isAfk?: unknown;
}

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** Координаты живых игроков. Приходят чаще heartbeat и в базу не пишутся. */
export async function POST(req: Request) {
  const auth = await authenticateIngest(req);
  if (!auth.ok) return authErrorResponse(auth);

  let body: { serverId?: unknown; players?: unknown };
  try {
    body = JSON.parse(auth.rawBody) as { serverId?: unknown; players?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (body.serverId !== auth.server.id) {
    return NextResponse.json({ error: 'serverId mismatch' }, { status: 403 });
  }
  if (!Array.isArray(body.players)) {
    return NextResponse.json({ error: 'players must be an array' }, { status: 400 });
  }

  const players: PlayerPosition[] = (body.players as IncomingPlayer[])
    .filter((p) => typeof p?.steamId === 'string')
    .map((p) => ({
      steamId: p.steamId as string,
      name: typeof p.name === 'string' ? p.name : (p.steamId as string),
      x: num(p.x),
      y: num(p.y),
      z: num(p.z),
      isAfk: p.isAfk === true,
    }));

  setPositions(auth.server.id, players);

  return NextResponse.json({ ok: true, accepted: players.length });
}
