/**
 * Общая часть проверок для клиента и сервера.
 * Здесь не должно быть импортов Prisma — файл попадает в клиентский бандл.
 */

/** Исход проверки. cancelled — отмена, passed — игрок чист. */
export type CheckOutcome = 'ban' | 'team_ban' | 'passed' | 'cancelled';

export type CheckMessageAuthor = 'panel' | 'player';

export interface CheckMessage {
  id: string;
  from: CheckMessageAuthor;
  /** Канал исходного сообщения игрока; у сообщений панели — null. */
  channel: string | null;
  text: string;
  createdAt: string; // ISO
}

/** Активная проверка вместе с перепиской — то, что рисует док проверки. */
export interface ActiveCheck {
  id: string;
  steamId: string;
  name: string;
  serverId: string;
  serverName: string;
  startedAt: string; // ISO
  bannerVisible: boolean;
  messages: CheckMessage[];
}

/** Проверка целиком — то, что рисует её отдельная страница. */
export interface CheckRoomData {
  id: string;
  /** Короткий номер проверки для шапки: cuid в заголовок не покажешь. */
  number: number;
  steamId: string;
  name: string;
  /** Кто ведёт проверку. */
  admin: string | null;
  serverId: string;
  serverName: string;
  active: boolean;
  bannerVisible: boolean;
  startedAt: string; // ISO
  finishedAt: string | null; // ISO
  outcome: CheckOutcome | null;
  reason: string | null;
  messages: CheckMessage[];
}

/**
 * Номер проверки — то, что видно в шапке как «#570160».
 * Считается из id, поэтому у одной проверки он всегда один и тот же.
 */
export function checkNumber(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return 100000 + (hash % 900000);
}

/**
 * Заголовок баннера на весь экран игрока. Остальные строки баннера
 * (про Discord и блокировку) — оформление, они лежат в плагине.
 */
export const BANNER_TEXT = 'ВАС ВЫЗВАЛИ НА ПРОВЕРКУ';

/** Причины с фиксированным текстом — их нельзя переопределить из UI. */
export const PASSED_REASON = 'Игрок прошел проверку';
export const TEAM_BAN_REASON = 'Игра с читером';

/** Готовые причины отмены проверки; последним пунктом в UI идёт своя причина. */
export const CANCEL_REASONS = [
  'Игрок вышел с сервера',
  'Игрок не выходит на связь',
  'Проверка отложена',
  'Вызов был ошибочным',
] as const;

export const MAX_CHECK_MESSAGE_LENGTH = 240;
export const MAX_CHECK_REASON_LENGTH = 160;

/** Фильтр списка проверок в разделе «Проверки». */
export type CheckHistoryFilter = 'all' | 'active' | 'finished' | 'banned' | 'clean';

export const CHECK_FILTER_OPTIONS: { value: CheckHistoryFilter; label: string }[] = [
  { value: 'all', label: 'Все проверки' },
  { value: 'active', label: 'Идут сейчас' },
  { value: 'finished', label: 'Завершённые' },
  { value: 'banned', label: 'С баном' },
  { value: 'clean', label: 'Прошли проверку' },
];

export function isCheckHistoryFilter(value: unknown): value is CheckHistoryFilter {
  return (
    value === 'all' ||
    value === 'active' ||
    value === 'finished' ||
    value === 'banned' ||
    value === 'clean'
  );
}

/** Строка списка проверок. */
export interface CheckHistoryItem {
  id: string;
  steamId: string;
  name: string;
  /** Кто вызвал; null — проверка заведена до появления поля. */
  admin: string | null;
  serverName: string;
  startedAt: string; // ISO
  finishedAt: string | null; // ISO
  /** null — проверка ещё идёт. */
  outcome: CheckOutcome | null;
  reason: string | null;
  /** Дискорд, названный игроком командой /ds; null — не назвал. */
  discord: string | null;
  /** Действует ли на игрока бан прямо сейчас — это не итог этой проверки. */
  bannedNow: boolean;
  messagesCount: number;
}

/** Подпись и цвет бейджа исхода. */
export function checkOutcomeBadge(outcome: CheckOutcome | null): {
  label: string;
  bg: string;
  color: string;
} {
  switch (outcome) {
    case 'ban':
      return { label: 'Забанен', bg: 'rgba(239,68,68,0.16)', color: '#ef4444' };
    case 'team_ban':
      return { label: 'Бан тимы', bg: 'rgba(239,68,68,0.16)', color: '#ef4444' };
    case 'passed':
      return { label: 'Чист', bg: 'rgba(34,197,94,0.16)', color: '#22c55e' };
    case 'cancelled':
      return { label: 'Отменена', bg: 'rgba(234,179,8,0.16)', color: '#eab308' };
    default:
      return { label: 'Идёт', bg: 'rgba(59,130,246,0.18)', color: '#7dabf8' };
  }
}

/** Сообщение о вызове, которое плагин показывает игроку сразу при старте проверки. */
export const CHECK_INVITE_MESSAGE =
  'Вас вызвали на проверку. Напишите в чат: /ds ваш_дискорд';

export function isCheckOutcome(value: unknown): value is CheckOutcome {
  return value === 'ban' || value === 'team_ban' || value === 'passed' || value === 'cancelled';
}

/**
 * Что игрок и сервер увидят в игровом чате после завершения проверки.
 * broadcast === null — объявлять на весь сервер нечего (отмена и успешная проверка
 * касаются только самого игрока).
 */
export function checkResultMessages(
  outcome: CheckOutcome,
  reason: string,
  playerName: string,
): { player: string; broadcast: string | null } {
  switch (outcome) {
    case 'ban':
      return {
        player: `Вы забанены за ${reason}`,
        broadcast: `Игрок ${playerName} забанен за ${reason}`,
      };
    case 'team_ban':
      return {
        player: `Вы забанены за ${reason}`,
        broadcast: `Команда игрока ${playerName} забанена за ${reason}`,
      };
    case 'cancelled':
      return { player: `Проверка отложена: ${reason}`, broadcast: null };
    case 'passed':
      return { player: 'Проверка пройдена', broadcast: null };
  }
}
