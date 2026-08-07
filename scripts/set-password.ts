/**
 * Смена пароля учётки из консоли сервера.
 *
 *   npm run user:password -- <логин-или-почта> <новый-пароль>
 *
 * Восстановить старый пароль нельзя — в базе лежит только его scrypt-хэш.
 * Команда ставит новый, подтверждает почту и гасит все живые сессии этой учётки:
 * если пароль меняют из-за утечки, чужой вход должен оборваться сразу.
 *
 * Формы восстановления по почте в панели пока нет — это способ вернуть доступ
 * владельцу сервера, у которого есть ssh.
 */
import { PrismaClient } from '@prisma/client';
import { checkPassword, normalizeLogin } from '../src/lib/authShared';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient();

async function main() {
  const [identifierRaw, password] = process.argv.slice(2);

  if (!identifierRaw || !password) {
    console.error('Использование: npm run user:password -- <логин-или-почта> <новый-пароль>');
    process.exit(1);
  }

  const problem = checkPassword(password);
  if (problem) {
    console.error(`Пароль не годится: ${problem}`);
    process.exit(1);
  }

  const identifier = normalizeLogin(identifierRaw);
  const user = await prisma.user.findFirst({
    where: { OR: [{ login: identifier }, { email: identifier }] },
  });

  if (!user) {
    console.error(`Учётка «${identifierRaw}» не найдена.`);
    const all = await prisma.user.findMany({ select: { login: true, email: true } });
    if (all.length) {
      console.error('Есть такие:');
      for (const u of all) console.error(`  ${u.login}  (${u.email})`);
    } else {
      console.error('В базе вообще нет учёток — зарегистрируйте первую через /login.');
    }
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
  });

  const killed = await prisma.session.deleteMany({ where: { userId: user.id } });

  console.log(`Пароль для «${user.login}» (${user.email}) обновлён.`);
  if (!user.emailVerifiedAt) console.log('Почта отмечена подтверждённой.');
  if (killed.count > 0) console.log(`Сброшено активных сессий: ${killed.count}.`);
  console.log('Теперь войдите на /login с новым паролем.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
