import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isDenied, requireDeveloper } from '@/lib/apiAuth';
import { hashPassword } from '@/lib/auth';
import { checkPassword, normalizeLogin } from '@/lib/authShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

/**
 * Сброс пароля по нику из раздела «Разработка» — то же, что
 * `npm run user:password`, только без захода на хост.
 *
 * Новый пароль приходит открытым текстом и тут же превращается в scrypt-хэш;
 * в базе и в логах его нет. Все живые сессии учётки гасятся: иначе снятая
 * с браузера кука продолжала бы работать со старым паролем.
 */
export async function POST(req: Request) {
  const dev = await requireDeveloper();
  if (isDenied(dev)) return dev;

  const body = (await req.json().catch(() => ({}))) as { nick?: unknown; password?: unknown };

  const identifier = typeof body.nick === 'string' ? normalizeLogin(body.nick) : '';
  if (!identifier) return NextResponse.json({ error: 'Укажите ник.' }, { status: 400 });

  const password = typeof body.password === 'string' ? body.password : '';
  const invalid = checkPassword(password);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  // Ник — это логин или почта: в разделе доступа они уже работают так же.
  const user = await prisma.user.findFirst({
    where: { OR: [{ login: identifier }, { email: identifier }] },
    select: { id: true, login: true, email: true },
  });
  if (!user) {
    return NextResponse.json({ error: `Учётка «${identifier}» не найдена.` }, { status: 404 });
  }

  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        // Почту заодно считаем подтверждённой: пароль выдал разработчик руками,
        // и упереться после этого в «подтвердите почту» человеку незачем.
        emailVerifiedAt: new Date(),
      },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    // Старые письма «сбросить пароль» после ручной смены смысла не имеют.
    prisma.emailToken.deleteMany({ where: { userId: user.id, type: 'reset' } }),
  ]);

  console.log(`[dev] ${dev.login}: reset password for ${user.login}`);

  return NextResponse.json(
    {
      ok: true,
      text: `Пароль учётки «${user.login}» заменён. Прежние сессии закрыты — вход только с новым паролем.`,
    },
    { headers: noStore },
  );
}
