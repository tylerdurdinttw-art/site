/** Общее для сервера и браузера: в этот модуль не тянется prisma. */

import type { AccessState } from '@/lib/accessShared';

/** Шаги «Начала работы» — цепочка, следующий открыт только после предыдущего. */
export const ONBOARDING_STEPS = 4;

/** Адрес проекта: латиница, цифры и дефис, до 32 символов. */
export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
}

/**
 * Пятизначный номер проекта — то, что видно в разделе «Общее».
 * Считается из неизменной части проекта, поэтому переименование его не меняет.
 */
export function projectPublicId(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return 10000 + (hash % 90000);
}

export interface StaffRow {
  id: string;
  /** Учётка, принявшая приглашение; null — кодом ещё никто не воспользовался. */
  userId: string | null;
  name: string;
  contact: string | null;
  role: string;
  permissions: string[];
  inviteCode: string;
  invitedAt: string;
  acceptedAt: string | null;
}

export interface ProjectState {
  id: string;
  name: string;
  slug: string;
  /** Номер проекта, который показывает раздел «Общее». */
  publicId: number;
  hasLogo: boolean;
  /** Последний пройденный шаг, 0..4. */
  step: number;
  done: boolean;
  /** Подключён ли хотя бы один сервер — первый шаг цепочки проверяется по факту. */
  serversCount: number;
  staff: StaffRow[];
  /** Оплаченный срок: пока он не активен, разделы панели закрыты. */
  access: AccessState;
}

/** Владелец проекта — создатель, он ровно один и меняется только через базу. */
export function isOwner(member: StaffRow): boolean {
  return member.role === 'owner';
}

/** Роль второго владельца в таблице staff. */
export const COOWNER_ROLE = 'coowner';

/**
 * Второй владелец. Его назначает владелец в разделе «Сотрудники», и такой
 * сотрудник тоже один: назначение нового снимает роль с прежнего.
 */
export function isCoOwner(member: StaffRow): boolean {
  return member.role === COOWNER_ROLE;
}

/**
 * Кому открыты группы «Управление» и «Проект»: владельцу и второму владельцу.
 * Остальным сотрудникам эти разделы не видны и не открываются по прямой ссылке.
 */
export function isProjectManager(member: StaffRow): boolean {
  return isOwner(member) || isCoOwner(member);
}

/** Запись сотрудника по учётке. null — человека в проекте нет. */
export function staffOfUser(staff: StaffRow[], userId: string): StaffRow | null {
  return staff.find((member) => member.userId === userId) ?? null;
}

/** Он владелец или второй владелец этого проекта? */
export function canManageProject(staff: StaffRow[], userId: string): boolean {
  const member = staffOfUser(staff, userId);
  return member ? isProjectManager(member) : false;
}

/** Сотрудники без владельца: приглашения и права касаются только их. */
export function membersOnly(staff: StaffRow[]): StaffRow[] {
  return staff.filter((member) => !isOwner(member));
}
