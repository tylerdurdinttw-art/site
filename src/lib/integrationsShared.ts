/** Интеграции проекта. Общее для сервера и браузера: prisma сюда не тянется. */

/** Ключ строки в panel_settings. */
export const INTEGRATIONS_KEY = 'integrations';

/** Один канал Discord: свой вебхук и свой выключатель. */
export interface DiscordChannel {
  /** Адрес вебхука канала; пустая строка — не привязан. */
  webhookUrl: string;
  /** Слать ли уведомления. Выключенный канал вебхук не теряет. */
  enabled: boolean;
}

/**
 * Каналов два, и это принципиально: бан-лист и репорты обычно разводят по разным
 * каналам сервера — в первый смотрит администрация, второй читают модераторы.
 */
export interface DiscordIntegration {
  /** Жалобы игроков. */
  reports: DiscordChannel;
  /** Бан-лист: выданные и снятые блокировки. */
  bans: DiscordChannel;
}

export interface Integrations {
  discord: DiscordIntegration;
}

export type DiscordChannelKey = keyof DiscordIntegration;

/** Подписи каналов — их же рисует раздел «Интеграции». */
export const DISCORD_CHANNELS: {
  key: DiscordChannelKey;
  title: string;
  toggle: string;
  hint: string;
}[] = [
  {
    key: 'bans',
    title: 'Бан-лист',
    toggle: 'Уведомлять о блокировках',
    hint: 'Каждый бан и разбан уходит в канал отдельным сообщением',
  },
  {
    key: 'reports',
    title: 'Репорты',
    toggle: 'Уведомлять о репортах',
    hint: 'Каждая жалоба игрока уходит в канал отдельным сообщением',
  },
];

const EMPTY_CHANNEL: DiscordChannel = { webhookUrl: '', enabled: true };

export const DEFAULT_INTEGRATIONS: Integrations = {
  discord: { reports: { ...EMPTY_CHANNEL }, bans: { ...EMPTY_CHANNEL } },
};

/**
 * Вебхук Discord: панель обращается по нему наружу, поэтому чужие адреса сюда
 * пускать нельзя — иначе поле превращается в готовый инструмент для запросов
 * с нашего сервера на произвольный хост.
 */
const WEBHOOK_RE =
  /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,}\/[\w-]{20,}$/;

export function isDiscordWebhook(url: string): boolean {
  return WEBHOOK_RE.test(url.trim());
}

function normalizeChannel(raw: unknown): DiscordChannel {
  const input = (raw ?? {}) as Partial<DiscordChannel>;
  const webhookUrl = typeof input.webhookUrl === 'string' ? input.webhookUrl.trim() : '';

  return {
    // Битое значение из базы не должно уезжать в fetch — держим только проверенное.
    webhookUrl: isDiscordWebhook(webhookUrl) ? webhookUrl : '',
    enabled: input.enabled !== false,
  };
}

export function normalizeIntegrations(raw: unknown): Integrations {
  const input = (raw ?? {}) as Partial<Record<keyof Integrations, unknown>>;
  const discord = (input.discord ?? {}) as Record<string, unknown>;

  // Старая форма записи — один вебхук на всё: { webhookUrl, reports: boolean }.
  // Такой адрес был заведён под репорты, туда его и переносим.
  const legacyUrl = typeof discord.webhookUrl === 'string' ? discord.webhookUrl : '';
  const legacyReports =
    typeof discord.reports === 'boolean'
      ? { webhookUrl: legacyUrl, enabled: discord.reports }
      : discord.reports;

  return {
    discord: {
      reports: normalizeChannel(legacyReports ?? { webhookUrl: legacyUrl }),
      bans: normalizeChannel(discord.bans),
    },
  };
}
