/**
 * Права сотрудников. Список фиксированный: он же рисуется на третьем шаге
 * онбординга и в разделе «Сотрудники».
 */

export const PERMISSIONS = [
  { key: 'check', label: 'Проверки', hint: 'Вызывать игроков на проверку и вести чат проверки' },
  { key: 'ban', label: 'Баны', hint: 'Банить игроков и команды' },
  { key: 'unban', label: 'Разбаны', hint: 'Снимать блокировки и чистить историю' },
  { key: 'mute', label: 'Муты', hint: 'Выдавать и снимать муты в чате' },
  { key: 'kick', label: 'Кики', hint: 'Отключать игрока от сервера' },
  { key: 'chat', label: 'Чат', hint: 'Писать в игровой чат от имени панели' },
  { key: 'reports', label: 'Репорты', hint: 'Разбирать жалобы игроков' },
  { key: 'servers', label: 'Серверы', hint: 'Подключать и отключать серверы проекта' },
  { key: 'settings', label: 'Настройки', hint: 'Менять настройки проекта и интеграции' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

/** Полный набор — его получает владелец проекта при создании. */
export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key);

const KEYS = new Set<string>(PERMISSIONS.map((p) => p.key));

/** Отбрасывает всё, чего нет в списке: наружу эндпоинты открыты. */
export function sanitizePermissions(input: unknown): PermissionKey[] {
  if (!Array.isArray(input)) return [];
  const unique = new Set<string>();
  for (const value of input) {
    if (typeof value === 'string' && KEYS.has(value)) unique.add(value);
  }
  return Array.from(unique) as PermissionKey[];
}
