import { NextResponse } from 'next/server';
import { CORS_HEADERS, requireBanlistKey } from '@/lib/publicApi';
import { publicBanStats } from '@/lib/publicBans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Счётчики банов и список серверов проекта: GET /api/public/bans/stats. */
export async function GET(req: Request) {
  const projectId = await requireBanlistKey(req);
  if (projectId instanceof NextResponse) return projectId;

  const data = await publicBanStats(projectId);
  return NextResponse.json(data, { headers: { ...CORS_HEADERS, 'cache-control': 'no-store' } });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
