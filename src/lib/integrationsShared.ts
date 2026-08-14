/** Интеграции проекта. Общее для сервера и браузера: prisma сюда не тянется. */

/** Ключ строки в panel_settings. */
export const INTEGRATIONS_KEY = 'integrations';

export interface DiscordIntegration {
  /** Адрес вебхука канала; пустая строка — не привязан. */
  webhookUrl: string;
  /** Слать ли уведомления о новых репортах. */
  reports: boolean;
}

export interface Integrations {
  discord: DiscordIntegration;
}

export const DEFAULT_INTEGRATIONS: Integrations = {
  discord: { webhookUrl: '', reports: true },
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

export function normalizeIntegrations(raw: unknown): Integrations {
  const input = (raw ?? {}) as Partial<Record<keyof Integrations, unknown>>;
  const discord = (input.discord ?? {}) as Partial<DiscordIntegration>;

  const webhookUrl = typeof discord.webhookUrl === 'string' ? discord.webhookUrl.trim() : '';

  return {
    discord: {
      // Битое значение из базы не должно уезжать в fetch — держим только проверенное.
      webhookUrl: isDiscordWebhook(webhookUrl) ? webhookUrl : '',
      reports: discord.reports !== false,
    },
  };
}
