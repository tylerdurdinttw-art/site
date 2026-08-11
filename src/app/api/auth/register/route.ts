import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import {
  checkEmail,
  checkLogin,
  checkPassword,
  normalizeEmail,
  normalizeLogin,
} from '@/lib/authShared';
import { clientIp, hashPassword, issueVerifyToken, pruneExpired, signupAllowed } from '@/lib/auth';
import { sendVerifyEmail } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  login?: unknown;
  email?: unknown;
  password?: unknown;
}

/**
 * Регистрация. Учётка создаётся сразу, но войти по ней нельзя, пока не открыта
 * ссылка из письма. Проекта у новой учётки нет: после входа человек выбирает
 * на /welcome — завести свой или войти в чужой по коду приглашения.
 */
export async function POST(req: Request) {
  const limit = rateLimit(`auth:register:${clientIp(req)}`, 5);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Слишком много попыток, подождите минуту.' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSec) } },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const rawLogin = typeof body.login === 'string' ? body.login : '';
  const rawEmail = typeof body.email === 'string' ? body.email : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const problem = checkLogin(rawLogin) ?? checkEmail(rawEmail) ?? checkPassword(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  if (!(await signupAllowed())) {
    return NextResponse.json({ error: 'Регистрация закрыта администратором.' }, { status: 403 });
  }

  const login = normalizeLogin(rawLogin);
  const email = normalizeEmail(rawEmail);

  const taken = await prisma.user.findFirst({
    where: { OR: [{ login }, { email }] },
    select: { login: true },
  });
  if (taken) {
    return NextResponse.json(
      { error: taken.login === login ? 'Такой логин уже занят.' : 'На эту почту уже есть аккаунт.' },
      { status: 409 },
    );
  }

  await pruneExpired();

  // Роль встанет вместе с проектом: owner — тому, кто его создал,
  // moderator — тому, кто вошёл по приглашению.
  const user = await prisma.user.create({
    data: {
      login,
      email,
      passwordHash: await hashPassword(password),
      role: 'moderator',
      projectId: null,
    },
  });

  const token = await issueVerifyToken(user.id);
  const mail = await sendVerifyEmail(email, login, token);

  return NextResponse.json({
    ok: true,
    email,
    mailSent: mail.sent,
    // Пока SMTP не настроен, письму уйти неоткуда — показываем ссылку прямо в ответе,
    // иначе первую учётку на свежем сервере нечем подтвердить. Настроенный, но
    // упавший SMTP такой ссылки не даёт: это уже авария почты, а не отсутствие настройки.
    verifyUrl: mail.configured ? undefined : `/verify?token=${encodeURIComponent(token)}`,
  });
}
