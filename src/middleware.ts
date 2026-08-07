import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/authShared';
import { unpackCookie } from '@/lib/sessionCookie';

/**
 * Единственная дверь в панель.
 *
 * Здесь проверяется только подпись и срок куки — в базу middleware не ходит,
 * оно исполняется в edge-рантайме, где prisma недоступна. Что сессия ещё жива,
 * проверяет getCurrentUser() уже на странице или в обработчике.
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

  const session = await unpackCookie(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  // Куда пользователь шёл — вернём его туда после входа.
  if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`);

  const res = NextResponse.redirect(url);
  // Кука не прошла проверку — гасим её, чтобы не гонять по кругу.
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const config = {
  // Статика и картинки next/image проверки не требуют.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)'],
};
