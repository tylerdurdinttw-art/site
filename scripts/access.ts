/**
 * Выдача доступа к панели с хоста сайта.
 *
 *   npm run access -- list
 *   npm run access -- grant <ник> [месяцев]
 *   npm run access -- revoke <ник>
 *
 * Ник — логин или почта владельца проекта: срок хранится у проекта, поэтому
 * доступ получает вся его команда разом. Минимальный срок — месяц; продление
 * прибавляется к остатку, а не сжигает его.
 *
 * Пока срок не выдан или уже вышел, разделы панели закрыты и вместо них
 * показывается «Продление» — см. lib/accessShared.ts и (panel)/layout.tsx.
 */
import { PrismaClient } from '@prisma/client';
import { normalizeLogin } from '../src/lib/authShared';
import {
  MAX_ACCESS_MONTHS,
  MIN_ACCESS_MONTHS,
  accessStateOf,
  extendBy,
} from '../src/lib/accessShared';

const prisma = new PrismaClient();

const USAGE = [
  'Использование:',
  '  npm run access -- list                    список проектов и сроков',
  '  npm run access -- grant <ник> [месяцев]   выдать или продлить доступ',
  '  npm run access -- revoke <ник>            закрыть доступ',
  '',
  `Ник — логин или почта владельца проекта. Месяцев: от ${MIN_ACCESS_MONTHS} до ${MAX_ACCESS_MONTHS}, по умолчанию ${MIN_ACCESS_MONTHS}.`,
].join('\n');

function formatTerm(expiresAt: Date | null): string {
  const state = accessStateOf(expiresAt);
  if (!state.expiresAt) return 'доступ не выдавался';

  const date = new Date(state.expiresAt).toLocaleString('ru-RU');
  return state.active ? `до ${date} (осталось дней: ${state.daysLeft})` : `истёк ${date}`;
}

/** Проект по нику владельца. Ищем по учётке, а не по названию: ники уникальны. */
async function findProject(nick: string) {
  const identifier = normalizeLogin(nick);

  const user = await prisma.user.findFirst({
    where: { OR: [{ login: identifier }, { email: identifier }] },
    include: { project: true },
  });

  if (!user) {
    console.error(`Учётка «${nick}» не найдена. Список проектов: npm run access -- list`);
    return null;
  }
  if (!user.project) {
    console.error(`У «${nick}» нет проекта: он ещё не создал его и не вошёл по приглашению.`);
    return null;
  }

  return { user, project: user.project };
}

async function list() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'asc' },
    include: { staff: { where: { role: 'owner' }, include: { user: true } } },
  });

  if (projects.length === 0) {
    console.log('Проектов пока нет.');
    return;
  }

  for (const project of projects) {
    const owner = project.staff[0]?.user?.login ?? project.staff[0]?.name ?? '—';
    console.log(`${project.name} (${project.slug}) · владелец ${owner} · ${formatTerm(project.accessExpiresAt)}`);
  }
}

async function grant(nick: string, rawMonths: string | undefined) {
  const months = rawMonths === undefined ? MIN_ACCESS_MONTHS : Number(rawMonths);

  if (!Number.isInteger(months) || months < MIN_ACCESS_MONTHS || months > MAX_ACCESS_MONTHS) {
    console.error(
      `Месяцев должно быть целое число от ${MIN_ACCESS_MONTHS} до ${MAX_ACCESS_MONTHS}; получено «${rawMonths}».`,
    );
    process.exitCode = 1;
    return;
  }

  const found = await findProject(nick);
  if (!found) {
    process.exitCode = 1;
    return;
  }

  const { project } = found;
  const expiresAt = extendBy(project.accessExpiresAt, months);

  await prisma.project.update({ where: { id: project.id }, data: { accessExpiresAt: expiresAt } });

  console.log(`Проект «${project.name}»: доступ ${formatTerm(expiresAt)}.`);
}

async function revoke(nick: string) {
  const found = await findProject(nick);
  if (!found) {
    process.exitCode = 1;
    return;
  }

  const { project } = found;
  await prisma.project.update({ where: { id: project.id }, data: { accessExpiresAt: null } });

  console.log(`Проект «${project.name}»: доступ закрыт, панель показывает «Продление».`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'list':
      await list();
      break;
    case 'grant':
      if (!args[0]) {
        console.error(USAGE);
        process.exitCode = 1;
        break;
      }
      await grant(args[0], args[1]);
      break;
    case 'revoke':
      if (!args[0]) {
        console.error(USAGE);
        process.exitCode = 1;
        break;
      }
      await revoke(args[0]);
      break;
    default:
      console.error(USAGE);
      process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
