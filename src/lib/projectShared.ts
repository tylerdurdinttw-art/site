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

/** Владелец проекта — он ровно один и правится только через базу. */
export function isOwner(member: StaffRow): boolean {
  return member.role === 'owner';
}

/** Сотрудники без владельца: приглашения и права касаются только их. */
export function membersOnly(staff: StaffRow[]): StaffRow[] {
  return staff.filter((member) => !isOwner(member));
}
