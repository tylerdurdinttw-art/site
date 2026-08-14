import { prisma } from '@/lib/prisma';
import { normalizeLogin } from '@/lib/authShared';
import {
  MAX_ACCESS_MONTHS,
  MIN_ACCESS_MONTHS,
  accessStateOf,
  extendBy,
} from '@/lib/accessShared';
import type { DevProjectRow } from '@/lib/devShared';

/**
 * Выдача доступа из раздела «Разработка» — то же, что `npm run access`,
 * только руками, без захода на хост. Срок лежит у проекта, поэтому продление
 * по нику владельца открывает панель всей его команде разом.
 */

export type AccessResult =
  | { ok: true; projectName: string; expiresAt: string | null; text: string }
  | { ok: false; error: string; status: number };

/**
 * Проект по нику. Ищем учётку по логину или почте, а от неё — проект, где
 * человек владелец: именно его срок и продлевается. Если владельцем он нигде
 * не записан, берём проект, в котором он сейчас работает — иначе продлить
 * доступ команде, где владелец потерялся, было бы нечем.
 */
type Found =
  | { ok: false; error: string; status: number }
  | {
      ok: true;
      project: { id: string; name: string; accessExpiresAt: Date | null };
      /** Ник и правда владелец проекта; false — взят проект, где он просто работает. */
      isOwner: boolean;
    };

async function findProjectByNick(nick: string): Promise<Found> {
  const identifier = normalizeLogin(nick);
  if (!identifier) return { ok: false, error: 'Укажите ник.', status: 400 };

  const user = await prisma.user.findFirst({
    where: { OR: [{ login: identifier }, { email: identifier }] },
    select: { id: true, login: true, projectId: true },
  });
  if (!user) return { ok: false, error: `Учётка «${nick}» не найдена.`, status: 404 };

  const owned = await prisma.staff.findFirst({
    where: { userId: user.id, role: 'owner' },
    select: { projectId: true },
  });

  const projectId = owned?.projectId ?? user.projectId;
  if (!projectId) {
    return {
      ok: false,
      error: `У «${nick}» нет проекта: он ещё не создал его и не вошёл по приглашению.`,
      status: 409,
    };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, accessExpiresAt: true },
  });
  if (!project) return { ok: false, error: 'Проект уже удалён.', status: 404 };

  return { ok: true, project, isOwner: Boolean(owned) };
}

/** Продление: месяцы прибавляются к остатку, а не сжигают его. */
export async function grantAccessByNick(nick: string, months: number): Promise<AccessResult> {
  if (!Number.isInteger(months) || months < MIN_ACCESS_MONTHS || months > MAX_ACCESS_MONTHS) {
    return {
      ok: false,
      error: `Месяцев: целое число от ${MIN_ACCESS_MONTHS} до ${MAX_ACCESS_MONTHS}.`,
      status: 400,
    };
  }

  const found = await findProjectByNick(nick);
  if (!found.ok) return { ok: false, error: found.error, status: found.status };

  const { project } = found;
  const expiresAt = extendBy(project.accessExpiresAt, months);

  await prisma.project.update({ where: { id: project.id }, data: { accessExpiresAt: expiresAt } });

  const state = accessStateOf(expiresAt);
  return {
    ok: true,
    projectName: project.name,
    expiresAt: state.expiresAt,
    text:
      `Проект «${project.name}» продлён на ${months} мес. — доступ до ` +
      `${expiresAt.toLocaleDateString('ru-RU')} (осталось дней: ${state.daysLeft})` +
      (found.isOwner ? '.' : '. Владельцем этот ник нигде не записан — взят его текущий проект.'),
  };
}

/** Закрытие доступа: панель начнёт показывать «Продление» вместо разделов. */
export async function revokeAccessByNick(nick: string): Promise<AccessResult> {
  const found = await findProjectByNick(nick);
  if (!found.ok) return { ok: false, error: found.error, status: found.status };

  const { project } = found;
  await prisma.project.update({ where: { id: project.id }, data: { accessExpiresAt: null } });

  return {
    ok: true,
    projectName: project.name,
    expiresAt: null,
    text: `Проект «${project.name}»: доступ закрыт, панель показывает «Продление».`,
  };
}

/** Все проекты со сроками — то же, что `npm run access -- list`. */
export async function listProjectsForDev(): Promise<DevProjectRow[]> {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      staff: { where: { role: 'owner' }, include: { user: { select: { login: true, email: true } } } },
      _count: { select: { servers: true } },
    },
  });

  return projects.map((project) => {
    const owner = project.staff[0];
    const state = accessStateOf(project.accessExpiresAt);

    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      owner: owner?.user?.login ?? owner?.name ?? '—',
      ownerEmail: owner?.user?.email ?? null,
      expiresAt: state.expiresAt,
      active: state.active,
      daysLeft: state.daysLeft,
      serversCount: project._count.servers,
      createdAt: project.createdAt.toISOString(),
    };
  });
}
