import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { ALL_PERMISSION_KEYS } from '@/lib/permissions';
import type { ProjectState, StaffRow } from '@/lib/projectShared';

import { projectPublicId } from '@/lib/projectShared';

export { ONBOARDING_STEPS, projectPublicId, slugify } from '@/lib/projectShared';
export type { ProjectState, StaffRow } from '@/lib/projectShared';

export function generateInviteCode(): string {
  return randomBytes(9).toString('base64url');
}

export function toStaffRow(row: {
  id: string;
  name: string;
  contact: string | null;
  role: string;
  permissions: string[];
  inviteCode: string;
  invitedAt: Date;
  acceptedAt: Date | null;
}): StaffRow {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact,
    role: row.role,
    permissions: row.permissions,
    inviteCode: row.inviteCode,
    invitedAt: row.invitedAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
  };
}

/** Состояние проекта пользователя. null — проекта у него ещё нет. */
export async function getProjectState(projectId: string | null): Promise<ProjectState | null> {
  if (!projectId) return null;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { staff: { orderBy: { invitedAt: 'asc' } } },
  });
  if (!project) return null;

  const serversCount = await prisma.server.count({ where: { projectId } });

  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    // Номер считается от даты создания: она не меняется, значит и номер стабилен.
    publicId: projectPublicId(project.createdAt.toISOString()),
    hasLogo: Boolean(project.logo),
    step: project.onboardingStep,
    done: project.onboardingDone,
    serversCount,
    staff: project.staff.map(toStaffRow),
  };
}

/**
 * Заводит проект и делает пользователя его владельцем: сам проект, запись
 * сотрудника со всеми правами и переключение учётки на новый проект — одной
 * транзакцией, чтобы наполовину созданного проекта не осталось.
 */
export async function createProjectForUser(
  userId: string,
  userLogin: string,
  data: { name: string; slug: string; logo: Buffer | null; logoType: string | null },
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        name: data.name,
        slug: data.slug,
        logo: data.logo,
        logoType: data.logoType,
      },
    });

    await tx.staff.create({
      data: {
        projectId: project.id,
        name: userLogin,
        role: 'owner',
        // У владельца прав по определению все: ограничивать себя ему нечем.
        permissions: [...ALL_PERMISSION_KEYS],
        userId,
        inviteCode: generateInviteCode(),
        acceptedAt: new Date(),
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: { projectId: project.id, role: 'owner' },
    });

    return project.id;
  });
}

export type JoinResult =
  | { ok: true; projectId: string; projectName: string }
  | { ok: false; error: string; status: number };

/**
 * Вход в чужой проект по коду приглашения. Код одноразовый: занятую запись
 * второй раз не отдаём, иначе одна ссылка пускала бы в проект кого угодно.
 */
export async function joinProjectByInvite(
  userId: string,
  userLogin: string,
  rawCode: string,
): Promise<JoinResult> {
  const inviteCode = rawCode.trim();
  if (!inviteCode) return { ok: false, error: 'Введите код приглашения.', status: 400 };

  const staff = await prisma.staff.findUnique({
    where: { inviteCode },
    include: { project: { select: { id: true, name: true } } },
  });
  if (!staff) return { ok: false, error: 'Приглашение не найдено.', status: 404 };

  // Свой же код — не ошибка: человек просто вернулся по старой ссылке.
  if (staff.userId === userId) {
    await prisma.user.update({ where: { id: userId }, data: { projectId: staff.projectId } });
    return { ok: true, projectId: staff.projectId, projectName: staff.project.name };
  }

  if (staff.userId) {
    return { ok: false, error: 'Это приглашение уже кем-то использовано.', status: 409 };
  }

  const claimed = await prisma.staff.updateMany({
    where: { id: staff.id, userId: null },
    data: {
      userId,
      acceptedAt: new Date(),
      // Имя в приглашении — то, как владелец записал человека; если поля не было,
      // подставляем логин, иначе в списке сотрудников будет пусто.
      name: staff.name || userLogin,
    },
  });
  if (claimed.count === 0) {
    return { ok: false, error: 'Это приглашение уже кем-то использовано.', status: 409 };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { projectId: staff.projectId, role: staff.role === 'owner' ? 'owner' : 'moderator' },
  });

  return { ok: true, projectId: staff.projectId, projectName: staff.project.name };
}

/** Короткая карточка проекта для экрана приглашения. null — код неизвестен. */
export async function previewInvite(inviteCode: string) {
  const staff = await prisma.staff.findUnique({
    where: { inviteCode },
    include: { project: { select: { name: true, slug: true } } },
  });
  if (!staff) return null;

  return {
    projectName: staff.project.name,
    projectSlug: staff.project.slug,
    name: staff.name,
    permissions: staff.permissions,
    taken: Boolean(staff.userId),
  };
}
