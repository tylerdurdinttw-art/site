/**
 * Общая часть чата для клиента и сервера.
 * Здесь не должно быть импортов Prisma — файл попадает в клиентский бандл.
 */

export const DEFAULT_HIGHLIGHT_COLOR = '#ff4444';
export const HIGHLIGHT_COLOR_KEY = 'chat.highlightColor';

export interface ChatMessage {
  id: string;
  steamId: string | null;
  name: string;
  channel: string;
  message: string;
  serverName: string;
  timestamp: string; // ISO
}

export interface ChatKeyword {
  id: string;
  word: string;
}

/** #rgb или #rrggbb, регистр не важен. */
export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}
