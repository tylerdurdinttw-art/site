import { NextResponse } from 'next/server';
import { isDenied, requireDeveloper } from '@/lib/apiAuth';
import { grantAccessByNick, listProjectsForDev, revokeAccessByNick } from '@/lib/devAccess';
import { MIN_ACCESS_MONTHS } from '@/lib/accessShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

/** Все проекты и их сроки — то же, что `npm run access -- list`. */
export async function GET() {
  const dev = await requireDeveloper();
  if (isDenied(dev)) return dev;

  return NextResponse.json({ projects: await listProjectsForDev() }, { headers: noStore });
}

/** Продление и закрытие доступа по нику владельца проекта. */
export async function POST(req: Request) {
  const dev = await requireDeveloper();
  if (isDenied(dev)) return dev;

  const body = (await req.json().catch(() => ({}))) as {
    nick?: unknown;
    action?: unknown;
    months?: unknown;
  };

  const nick = typeof body.nick === 'string' ? body.nick.trim() : '';
  if (!nick) return NextResponse.json({ error: 'Укажите ник.' }, { status: 400 });

  const result =
    body.action === 'revoke'
      ? await revokeAccessByNick(nick)
      : await grantAccessByNick(
          nick,
          typeof body.months === 'number' ? body.months : MIN_ACCESS_MONTHS,
        );

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  console.log(`[dev] ${dev.login}: ${body.action === 'revoke' ? 'revoke' : 'grant'} ${nick} — ${result.text}`);

  return NextResponse.json(
    { ok: true, text: result.text, projects: await listProjectsForDev() },
    { headers: noStore },
  );
}
