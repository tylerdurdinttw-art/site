import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { joinProjectByInvite } from '@/lib/project';
import { rateLimit } from '@/lib/rateLimit';
import { clientIp } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Вход в чужой проект по коду приглашения.
 *
 * Работает без выбранного проекта — это второй способ его получить, наравне с
 * созданием своего. Частоту ограничиваем: код короткий, и перебирать его
 * снаружи никто не должен.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const limit = rateLimit(`project:join:${clientIp(req)}`, 10);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Слишком много попыток, подождите минуту.' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSec) } },
    );
  }

  if (user.projectId) {
    return NextResponse.json({ error: 'Вы уже состоите в проекте.' }, { status: 409 });
  }

  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === 'string' ? body.code : '';

  const result = await joinProjectByInvite(user.id, user.login, code);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    { ok: true, projectId: result.projectId, projectName: result.projectName },
    { headers: { 'cache-control': 'no-store' } },
  );
}
