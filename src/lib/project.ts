import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { ProjectState, StaffRow } from '@/lib/projectShared';

import { projectPublicId } from '@/lib/projectShared';

export { ONBOARDING_STEPS, projectPublicId, slugify } from '@/lib/projectShared';
export type { ProjectState, StaffRow } from '@/lib/projectShared';

/** Панель обслуживает один проект, поэтому строка в таблице всегда одна. */
export const SINGLETON_PROJECT_ID = 'default';

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

/** null — проект ещё не создан, панель показывает экран создания. */
export async function getProjectState(): Promise<ProjectState | null> {
  const project = await prisma.project.findUnique({
    where: { id: SINGLETON_PROJECT_ID },
    include: { staff: { orderBy: { invitedAt: 'asc' } } },
  });
  if (!project) return null;

  const serversCount = await prisma.server.count();

  return {
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
