/**
 * Настройки модерации: общая часть для клиента и сервера.
 * Prisma сюда не тянется — файл попадает в клиентский бандл.
 *
 * Хранятся одной строкой в `panel_settings` под ключом MODERATION_SETTINGS_KEY:
 * набор мелкий, читается целиком и всегда целиком же переписывается.
 */

export const MODERATION_SETTINGS_KEY = 'moderation';

export interface ReportSettings {
  /** Удалять репорты на игрока после его блокировки. */
  deleteAfterBan: boolean;
  /** Удалять репорты на игрока после завершения проверки. */
  deleteAfterCheck: boolean;
  /** Через сколько дней репорт удаляется сам; 0 — не удалять. */
  deleteAfterDays: number;
  /** Сколько часов не показывать репорты на проверенного игрока; 0 — показывать всегда. */
  ignoreAfterCheckHours: number;
}

export interface CheckSettings {
  /** Меньше этого числа жалоб — проверку начать нельзя. */
  minReports: number;
  /** Писать в игровой чат, что игрок вызван на проверку. */
  announceStart: boolean;
  /** Писать в игровой чат, что проверка завершена без нарушений. */
  announceFinish: boolean;
  /** Уведомлять о результате всех, кто жаловался на игрока. */
  notifyReporters: boolean;
}

export interface BanSettings {
  /** Сообщение о бане в игровом чате. */
  announceInChat: boolean;
  /** Ограничить число блокировок от одного сотрудника за интервал. */
  limitEnabled: boolean;
  limitCount: number;
  limitIntervalMin: number;
  /** Готовые причины блокировки игрока. */
  banReasons: string[];
  /** Готовые причины блокировки всей команды. */
  teamBanReasons: string[];
  /** Готовые вердикты проверки — из них выбирают при завершении. */
  checkVerdicts: string[];
}

export interface ModerationSettings {
  reports: ReportSettings;
  checks: CheckSettings;
  bans: BanSettings;
}

export const DEFAULT_SETTINGS: ModerationSettings = {
  reports: {
    deleteAfterBan: true,
    deleteAfterCheck: true,
    deleteAfterDays: 14,
    ignoreAfterCheckHours: 0,
  },
  checks: {
    minReports: 1,
    announceStart: false,
    announceFinish: false,
    notifyReporters: false,
  },
  bans: {
    announceInChat: true,
    limitEnabled: false,
    limitCount: 15,
    limitIntervalMin: 60,
    banReasons: [
      'Чит',
      'Макрос',
      'Багоюз',
      'Нарушение правил (by {client_tag})',
      'Мультиаккаунт',
      '1+',
      '2+',
      '3+',
    ],
    teamBanReasons: ['Игра с читером', 'Тиммейт ({main_steam_id})', '1+', '2+', '3+'],
    checkVerdicts: [
      'Чит',
      'Макрос',
      'Багоюз',
      'Покинул сервер во время проверки',
      'Игнорирование проверки',
      'Отказ от проверки',
      'По результатам проверки',
    ],
  },
};

/** Вкладки раздела «Настройки». Их ровно три — остальное панель пока не настраивает. */
export type SettingsTab = 'reports' | 'checks' | 'bans';

export const SETTINGS_TABS: { key: SettingsTab; label: string }[] = [
  { key: 'reports', label: 'Репорты' },
  { key: 'checks', label: 'Проверки' },
  { key: 'bans', label: 'Баны' },
];

export const DELETE_AFTER_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Никогда' },
  { value: 1, label: '1 день' },
  { value: 3, label: '3 дня' },
  { value: 7, label: '7 дней' },
  { value: 14, label: '14 дней' },
  { value: 30, label: '30 дней' },
];

export const IGNORE_AFTER_CHECK_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Нет' },
  { value: 1, label: '1 час' },
  { value: 6, label: '6 часов' },
  { value: 24, label: '24 часа' },
];

export const MIN_REPORTS_MAX = 20;
export const BAN_LIMIT_MAX = 200;
export const BAN_INTERVAL_MAX = 1440;
export const MAX_REASON_ITEMS = 24;
export const MAX_REASON_LENGTH = 64;

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function option(value: unknown, options: { value: number }[], fallback: number): number {
  return options.some((o) => o.value === value) ? (value as number) : fallback;
}

function reasons(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim().slice(0, MAX_REASON_LENGTH))
    .filter(Boolean);
  // Дубли схлопываем: список причин — это набор, а не история правок.
  return Array.from(new Set(cleaned)).slice(0, MAX_REASON_ITEMS);
}

/**
 * Приводит что угодно к валидным настройкам: недостающее берётся из значений
 * по умолчанию. Через неё проходит и то, что пришло из базы, и то, что прислал браузер.
 */
export function normalizeSettings(raw: unknown): ModerationSettings {
  const input = (raw ?? {}) as Partial<Record<keyof ModerationSettings, Record<string, unknown>>>;
  const r = input.reports ?? {};
  const c = input.checks ?? {};
  const b = input.bans ?? {};
  const d = DEFAULT_SETTINGS;

  return {
    reports: {
      deleteAfterBan: bool(r.deleteAfterBan, d.reports.deleteAfterBan),
      deleteAfterCheck: bool(r.deleteAfterCheck, d.reports.deleteAfterCheck),
      deleteAfterDays: option(r.deleteAfterDays, DELETE_AFTER_OPTIONS, d.reports.deleteAfterDays),
      ignoreAfterCheckHours: option(
        r.ignoreAfterCheckHours,
        IGNORE_AFTER_CHECK_OPTIONS,
        d.reports.ignoreAfterCheckHours,
      ),
    },
    checks: {
      minReports: int(c.minReports, d.checks.minReports, 0, MIN_REPORTS_MAX),
      announceStart: bool(c.announceStart, d.checks.announceStart),
      announceFinish: bool(c.announceFinish, d.checks.announceFinish),
      notifyReporters: bool(c.notifyReporters, d.checks.notifyReporters),
    },
    bans: {
      announceInChat: bool(b.announceInChat, d.bans.announceInChat),
      limitEnabled: bool(b.limitEnabled, d.bans.limitEnabled),
      limitCount: int(b.limitCount, d.bans.limitCount, 1, BAN_LIMIT_MAX),
      limitIntervalMin: int(b.limitIntervalMin, d.bans.limitIntervalMin, 1, BAN_INTERVAL_MAX),
      banReasons: reasons(b.banReasons, d.bans.banReasons),
      teamBanReasons: reasons(b.teamBanReasons, d.bans.teamBanReasons),
      checkVerdicts: reasons(b.checkVerdicts, d.bans.checkVerdicts),
    },
  };
}
