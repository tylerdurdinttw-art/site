import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { normalizeEmail } from '@/lib/authShared';
import { clientIp, issueVerifyToken } from '@/lib/auth';
import { sendVerifyEmail, smtpConfigured } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Повторное письмо с подтверждением. Ответ всегда одинаковый: по нему нельзя
 * узнать, заведён ли аккаунт на этот адрес.
 */
export async function POST(req: Request) {
  const limit = rateLimit(`auth:resend:${clientIp(req)}`, 3);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Письмо уже отправлено, подождите минуту.' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSec) } },
    );
  }

  let email = '';
  try {
    const body = (await req.json()) as { email?: unknown };
    if (typeof body.email === 'string') email = normalizeEmail(body.email);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;

  let verifyUrl: string | undefined;

  if (user && !user.emailVerifiedAt) {
    const token = await issueVerifyToken(user.id);
    await sendVerifyEmail(user.email, user.login, token);
    // Новый токен гасит предыдущий, поэтому ссылку надо отдать заново: иначе
    // та, что уже показана на экране, тихо перестанет работать.
    if (!smtpConfigured()) verifyUrl = `/verify?token=${encodeURIComponent(token)}`;
  }

  return NextResponse.json({ ok: true, mailSent: smtpConfigured(), verifyUrl });
}
