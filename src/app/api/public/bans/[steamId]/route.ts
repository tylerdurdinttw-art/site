import { NextResponse } from 'next/server';
import { CORS_HEADERS, publicError, requireBanlistKey } from '@/lib/publicApi';
import { publicBanStatus } from '@/lib/publicBans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Забанен ли игрок: GET /api/public/bans/<steamId64>. */
export async function GET(req: Request, { params }: { params: { steamId: string } }) {
  const projectId = await requireBanlistKey(req);
  if (projectId instanceof NextResponse) return projectId;

  if (!/^\d{17}$/.test(params.steamId)) return publicError('steamId: 17 digits', 400);

  const data = await publicBanStatus(projectId, params.steamId);
  return NextResponse.json(data, { headers: { ...CORS_HEADERS, 'cache-control': 'no-store' } });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
