import { NextResponse } from 'next/server';
import { CORS_HEADERS, publicError, requireBanlistKey } from '@/lib/publicApi';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, listPublicBans } from '@/lib/publicBans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function intParam(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Бан-лист проекта для внешнего сайта.
 * GET /api/public/bans?status=active|lifted|all&search=&server=&since=&page=&limit=
 */
export async function GET(req: Request) {
  const projectId = await requireBanlistKey(req);
  if (projectId instanceof NextResponse) return projectId;

  const params = new URL(req.url).searchParams;

  const status = params.get('status') ?? 'active';
  if (status !== 'active' && status !== 'lifted' && status !== 'all') {
    return publicError('status: active | lifted | all', 400);
  }

  let since: Date | null = null;
  const sinceRaw = params.get('since');
  if (sinceRaw) {
    since = new Date(/^\d+$/.test(sinceRaw) ? Number(sinceRaw) * 1000 : sinceRaw);
    if (Number.isNaN(since.getTime())) return publicError('since: ISO date or unix seconds', 400);
  }

  const data = await listPublicBans(projectId, {
    status,
    search: params.get('search')?.trim().slice(0, 64) ?? '',
    serverId: params.get('server') || null,
    since,
    page: intParam(params.get('page'), 1, 1, 100_000),
    limit: intParam(params.get('limit'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
  });

  return NextResponse.json(data, { headers: { ...CORS_HEADERS, 'cache-control': 'no-store' } });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
