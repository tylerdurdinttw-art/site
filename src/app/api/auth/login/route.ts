import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { normalizeLogin } from '@/lib/authShared';
import {
  clientIp,
  createSession,
  forgetLoginCookie,
  issueVerifyToken,
  pruneExpired,
  rememberLoginCookie,
  verifyPassword,
} from '@/lib/auth';
import { smtpConfigured } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  login?: unknown;
  password?: unknown;
  remember?: unknown;
}

/** Вход по логину или почте. Пароль неверен и учётки нет — ответ один и тот же. */
export async function POST(req: Request) {
  const limit = rateLimit(`auth:login:${clientIp(req)}`, 10);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа, подождите минуту.' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSec) } },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const identifier = typeof body.login === 'string' ? normalizeLogin(body.login) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const remember = body.remember === true;

  if (!identifier || !password) {
    return NextResponse.json({ error: 'Введите логин и пароль.' }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ login: identifier }, { email: identifier }] },
  });

  // Пароль проверяем даже без найденного пользователя — иначе по времени ответа
  // видно, какие логины существуют.
  const stored = user?.passwordHash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA';
  const ok = await verifyPassword(password, stored);

  if (!user || !ok) {
    return NextResponse.json({ error: 'Неверный логин или пароль.' }, { status: 401 });
  }

  if (!user.emailVerifiedAt) {
    // Пароль сошёлся — значит перед нами владелец учётки, и выдать ему ссылку
    // подтверждения безопасно. Пока SMTP не настроен, взять её больше негде:
    // письму неоткуда прийти, а экран «Проверьте почту» уже закрыт.
    const verifyUrl = smtpConfigured()
      ? undefined
      : `/verify?token=${encodeURIComponent(await issueVerifyToken(user.id))}`;

    return NextResponse.json(
      {
        error: 'Почта не подтверждена. Откройте ссылку из письма.',
        needVerify: true,
        email: user.email,
        verifyUrl,
      },
      { status: 403 },
    );
  }

  await pruneExpired();
  await createSession(user.id, remember, {
    ip: clientIp(req),
    userAgent: req.headers.get('user-agent'),
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  // «Запомнить меня» держит логин в отдельной куке, чтобы форма подставляла его после выхода.
  if (remember) rememberLoginCookie(user.login);
  else forgetLoginCookie();

  return NextResponse.json({ ok: true, login: user.login });
}
