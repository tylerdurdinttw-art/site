/**
 * Общая часть чата для клиента и сервера.
 * Здесь не должно быть импортов Prisma — файл попадает в клиентский бандл.
 */

export const DEFAULT_HIGHLIGHT_COLOR = '#ff4444';
export const HIGHLIGHT_COLOR_KEY = 'chat.highlightColor';

/** Длиннее в игровой чат отправлять бессмысленно — строка не поместится на экран. */
export const MAX_CHAT_MESSAGE_LENGTH = 240;

/** Канал, которым помечены реплики самой панели. */
export const PANEL_CHANNEL = 'PANEL';

export interface ChatMessage {
  id: string;
  steamId: string | null;
  name: string;
  channel: string;
  message: string;
  /** Сервер, где написано сообщение: туда же уходит мут автора. */
  serverId: string;
  serverName: string;
  timestamp: string; // ISO
}

/** Готовые сроки мута в меню игрока. */
export const MUTE_PRESETS: { seconds: number; label: string }[] = [
  { seconds: 60, label: '1m' },
  { seconds: 5 * 60, label: '5m' },
  { seconds: 30 * 60, label: '30m' },
  { seconds: 60 * 60, label: '60m' },
];

/** Потолок своего срока: год. Плагин Chat хранит секунды в Int32 — запас большой. */
export const MAX_MUTE_SECONDS = 365 * 24 * 60 * 60;
export const MAX_MUTE_REASON_LENGTH = 100;
/** Плагин Chat без причины мут не выдаёт — подставляем эту. */
export const DEFAULT_MUTE_REASON = 'Нарушение правил чата';

/**
 * Отдельной колонки под срок у команды нет, поэтому мут лежит в reason как
 * `<секунды>|<причина>`; плагин получает их уже раздельно (см. /api/ingest/commands).
 */
export function encodeMuteReason(seconds: number, reason: string): string {
  return `${seconds}|${reason}`;
}

export function decodeMuteReason(value: string): { seconds: number; reason: string } {
  const bar = value.indexOf('|');
  const seconds = Number.parseInt(bar >= 0 ? value.slice(0, bar) : value, 10);
  return {
    seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 0,
    reason: bar >= 0 ? value.slice(bar + 1) : '',
  };
}

/** 90 -> «1 мин 30 с», 7200 -> «2 ч»: подпись срока в меню и в ответах API. */
export function formatMuteDuration(seconds: number): string {
  const parts: string[] = [];
  const units: [number, string][] = [
    [86_400, 'д'],
    [3_600, 'ч'],
    [60, 'мин'],
    [1, 'с'],
  ];
  let rest = seconds;
  for (const [size, label] of units) {
    const n = Math.floor(rest / size);
    if (n > 0) parts.push(`${n} ${label}`);
    rest -= n * size;
  }
  return parts.slice(0, 2).join(' ') || '0 с';
}

export interface ChatKeyword {
  id: string;
  word: string;
}

/** #rgb или #rrggbb, регистр не важен. */
export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}
