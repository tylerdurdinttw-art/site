/**
 * Общее для сервера и браузера: имена кук, сроки жизни и проверки полей формы.
 * В этот модуль не тянется ни prisma, ни node:crypto — его импортируют и клиентские компоненты.
 */

/** Кука сессии: подписанная, httpOnly, браузеру недоступна из JS. */
export const SESSION_COOKIE = 'qp_session';

/**
 * Кука «запомнить меня»: сюда кладётся логин, чтобы форма входа подставляла его
 * после выхода. Пароль в куках не хранится — его нельзя положить туда безопасно.
 */
export const LOGIN_COOKIE = 'qp_login';

/** Сколько живёт сессия с отмеченной галочкой «запомнить меня». */
export const REMEMBER_DAYS = 30;

/** Сколько живёт сессия без галочки: кука сеансовая, но на сервере срок всё равно нужен. */
export const SESSION_HOURS = 12;

/** Сколько действует ссылка из письма с подтверждением почты. */
export const VERIFY_TOKEN_HOURS = 24;

export const LOGIN_MIN = 3;
export const LOGIN_MAX = 24;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

/** Латиница, цифры, точка, дефис и подчёркивание — то, что безопасно показывать в URL и письмах. */
const LOGIN_RE = /^[a-zA-Z0-9._-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

/** null — поле в порядке, строка — текст ошибки для пользователя. */
export function checkLogin(raw: string): string | null {
  const login = raw.trim();
  if (login.length < LOGIN_MIN) return `Логин короче ${LOGIN_MIN} символов.`;
  if (login.length > LOGIN_MAX) return `Логин длиннее ${LOGIN_MAX} символов.`;
  if (!LOGIN_RE.test(login)) return 'Логин: латиница, цифры, точка, дефис и подчёркивание.';
  return null;
}

export function checkEmail(raw: string): string | null {
  const email = raw.trim();
  if (!email) return 'Укажите почту.';
  if (email.length > 190) return 'Слишком длинный адрес почты.';
  if (!EMAIL_RE.test(email)) return 'Почта выглядит неправильно.';
  return null;
}

export function checkPassword(raw: string): string | null {
  if (raw.length < PASSWORD_MIN) return `Пароль короче ${PASSWORD_MIN} символов.`;
  if (raw.length > PASSWORD_MAX) return `Пароль длиннее ${PASSWORD_MAX} символов.`;
  if (!/[a-zA-Zа-яА-Я]/.test(raw) || !/[0-9]/.test(raw)) {
    return 'Пароль должен содержать буквы и цифры.';
  }
  return null;
}

export function normalizeLogin(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Что о себе знает вошедший пользователь — этот объект уходит в клиентские компоненты. */
export interface SessionUser {
  id: string;
  login: string;
  email: string;
  role: string;
  /** Проект, в котором человек работает. null — он его ещё не выбрал. */
  projectId: string | null;
}
