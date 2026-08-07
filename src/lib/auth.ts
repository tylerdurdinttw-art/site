import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import {
  LOGIN_COOKIE,
  REMEMBER_DAYS,
  SESSION_COOKIE,
  SESSION_HOURS,
  VERIFY_TOKEN_HOURS,
  type SessionUser,
} from '@/lib/authShared';
import { packCookie, randomToken, sha256Hex, unpackCookie } from '@/lib/sessionCookie';

export { hashPassword, verifyPassword } from '@/lib/password';

const DAY_MS = 24 * 60 * 60 * 1000;

/** https нужен для флага Secure: на localhost по http кука с ним просто не встанет. */
function secureCookies(): boolean {
  return (process.env.APP_URL ?? '').startsWith('https://');
}

/* ================= сессии ================= */

/**
 * Заводит сессию и ставит куку. `remember` растягивает срок до 30 дней и делает
 * куку постоянной; без него кука сеансовая и умирает вместе с вкладкой.
 */
export async function createSession(
  userId: string,
  remember: boolean,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const sid = randomToken();
  const secret = randomToken();
  const lifetimeMs = remember ? REMEMBER_DAYS * DAY_MS : SESSION_HOURS * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + lifetimeMs);

  await prisma.session.create({
    data: {
      id: sid,
      userId,
      tokenHash: await sha256Hex(secret),
      remember,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 200) ?? null,
      expiresAt,
    },
  });

  const value = await packCookie({ sid, secret, expiresAt: expiresAt.getTime() });

  cookies().set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies(),
    path: '/',
    // Без «запомнить меня» maxAge не ставим — браузер удалит куку по закрытии.
    ...(remember ? { maxAge: Math.floor(lifetimeMs / 1000) } : {}),
  });
}

/** Логин в отдельной куке — только чтобы форма входа подставляла его в следующий раз. */
export function rememberLoginCookie(login: string): void {
  cookies().set(LOGIN_COOKIE, login, {
    httpOnly: false,
    sameSite: 'lax',
    secure: secureCookies(),
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  });
}

export function forgetLoginCookie(): void {
  cookies().delete(LOGIN_COOKIE);
}

/** Читает куку, сверяет её с базой. null — гостя пускать некуда. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const payload = await unpackCookie(cookies().get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  // Секретная половина куки должна совпасть с хэшем из базы.
  if ((await sha256Hex(payload.secret)) !== session.tokenHash) return null;
  if (!session.user.emailVerifiedAt) return null;

  return {
    id: session.user.id,
    login: session.user.login,
    email: session.user.email,
    role: session.user.role,
  };
}

/** Для серверных страниц: без сессии уводит на вход. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** Гасит текущую сессию: строку из базы и куку. */
export async function destroySession(): Promise<void> {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  const payload = await unpackCookie(raw);
  if (payload) {
    await prisma.session.delete({ where: { id: payload.sid } }).catch(() => undefined);
  }
  cookies().delete(SESSION_COOKIE);
}

/** Чистка просроченных сессий и токенов — дёргается при входе, отдельного крона не нужно. */
export async function pruneExpired(): Promise<void> {
  const now = new Date();
  await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.emailToken.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]).catch(() => undefined);
}

/* ================= токены из писем ================= */

/**
 * Создаёт ссылку подтверждения почты. Открытый токен возвращается один раз —
 * в базе остаётся только его sha256.
 */
export async function issueVerifyToken(userId: string): Promise<string> {
  const token = randomToken();

  // Прошлые письма этого пользователя обесцениваем: рабочая ссылка всегда одна.
  await prisma.emailToken.deleteMany({ where: { userId, type: 'verify' } });
  await prisma.emailToken.create({
    data: {
      userId,
      type: 'verify',
      tokenHash: await sha256Hex(token),
      expiresAt: new Date(Date.now() + VERIFY_TOKEN_HOURS * 60 * 60 * 1000),
    },
  });

  return token;
}

export type VerifyResult = 'ok' | 'already' | 'invalid' | 'expired';

/** Гасит токен из письма и отмечает почту подтверждённой. */
export async function consumeVerifyToken(token: string): Promise<VerifyResult> {
  const row = await prisma.emailToken.findUnique({
    where: { tokenHash: await sha256Hex(token) },
    include: { user: true },
  });

  if (!row || row.type !== 'verify') return 'invalid';
  if (row.usedAt) return row.user.emailVerifiedAt ? 'already' : 'invalid';
  if (row.expiresAt.getTime() <= Date.now()) return 'expired';
  if (row.user.emailVerifiedAt) return 'already';

  await prisma.$transaction([
    prisma.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
  ]);

  return 'ok';
}

/* ================= прочее ================= */

/** IP клиента за обратным прокси — по нему считается rate-limit попыток входа. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/** Открыта ли регистрация. Первую учётку заводят всегда, дальше решает SIGNUP_OPEN. */
export async function signupAllowed(): Promise<boolean> {
  if ((await prisma.user.count()) === 0) return true;
  return (process.env.SIGNUP_OPEN ?? 'true') !== 'false';
}
