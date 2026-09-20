import { NextResponse } from 'next/server';
import { getPositions } from '@/lib/positions';
import { ensureAvatars } from '@/lib/steam';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;

  const serverId = new URL(req.url).searchParams.get('serverId');
  if (!serverId) return NextResponse.json({ error: 'serverId is required' }, { status: 400 });

  const { at, players } = getPositions(serverId);

  // Маркеры на карте — это аватарки, и берёт их браузер по /api/avatar/<steamId>.
  // Досылаем профили пачкой заранее, чтобы этот эндпоинт не ходил в Steam на
  // каждого игрока отдельно. Ответ ждать незачем: к следующему опросу подтянутся.
  if (players.length > 0) {
    void ensureAvatars(players.map((p) => p.steamId)).catch(() => undefined);
  }

  return NextResponse.json(
    { at, players },
    { headers: { 'cache-control': 'no-store' } },
  );
}
