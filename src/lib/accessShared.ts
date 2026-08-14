/** Срок доступа проекта. Общее для сервера и браузера: prisma сюда не тянется. */

/** Меньше месяца доступ не выдаётся — так решено на стороне продаж. */
export const MIN_ACCESS_MONTHS = 1;
/** Больше двух лет за раз — почти наверняка опечатка в команде. */
export const MAX_ACCESS_MONTHS = 24;

export interface AccessState {
  /** Когда доступ заканчивается; null — его ни разу не выдавали. */
  expiresAt: string | null;
  /** Открыты ли разделы панели прямо сейчас. */
  active: boolean;
  /** Сколько суток осталось; null — срока нет. Отрицательных не бывает: минимум 0. */
  daysLeft: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function accessStateOf(expiresAt: Date | string | null): AccessState {
  if (!expiresAt) return { expiresAt: null, active: false, daysLeft: null };

  const until = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  const left = until.getTime() - Date.now();

  return {
    expiresAt: until.toISOString(),
    active: left > 0,
    daysLeft: Math.max(0, Math.ceil(left / DAY_MS)),
  };
}

/**
 * Прибавляет месяцы к дате. Начало отсчёта — текущий срок, если он ещё не вышел:
 * продление не должно сжигать оплаченный остаток.
 */
export function extendBy(current: Date | null, months: number, now = new Date()): Date {
  const base = current && current.getTime() > now.getTime() ? new Date(current) : new Date(now);
  const day = base.getDate();

  base.setMonth(base.getMonth() + months);
  // 31 января + 1 месяц JS считает как 3 марта — возвращаем на последний день февраля.
  if (base.getDate() !== day) base.setDate(0);

  return base;
}

/** «12 августа 2026» — как срок показывается в разделе «Продление». */
export function formatAccessDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
