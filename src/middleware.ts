import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/authShared';
import { sessionCookieLooksValid } from '@/lib/sessionCookie';

/**
 * Единственная дверь в панель — но дверь неохраняемая.
 *
 * Middleware исполняется в edge-рантайме: сюда не доходят ни prisma, ни
 * переменные окружения (в edge-код они подставляются на сборке, а не при
 * запуске). Поэтому проверить подпись куки ключом AUTH_SECRET здесь нельзя —
 * попытка это делать заканчивалась тем, что подпись не сходилась никогда
 * и живые сессии умирали на первом же переходе.
 *
 * Отсюда роль скромная: увести гостя на форму входа, чтобы он не смотрел на
 * пустые экраны. Пускать или нет — решают getCurrentUser() и requireApiUser()
 * в Node-рантайме: они сверяют и подпись, и строку в таблице sessions.
 */

/** Страницы, открытые всем: без них не войти и не подтвердить почту. */
const PUBLIC_PAGES = ['/login', '/verify'];

/**
 * Открытые API. /api/ingest и /api/pair зовёт плагин с игрового сервера:
 * у него своя авторизация — подпись HMAC ключами сервера (см. lib/ingestAuth.ts).
 */
const PUBLIC_API = ['/api/auth/', '/api/ingest/'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))) return true;
  if (PUBLIC_API.some((prefix) => pathname.startsWith(prefix))) return true;
  // Обмен кода на ключи сервера; /api/pair/code выдаёт код из панели и остаётся закрытым.
  if (pathname === '/api/pair') return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  if (sessionCookieLooksValid(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  // Куда пользователь шёл — вернём его туда после входа.
  if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`);

  // Куку намеренно не трогаем: решение здесь принимается без проверки подписи,
  // и удалять по нему живую сессию было бы слишком самонадеянно. Просроченные
  // подчистит pruneExpired() при следующем входе.
  return NextResponse.redirect(url);
}

export const config = {
  // Статика и картинки next/image проверки не требуют.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)'],
};
