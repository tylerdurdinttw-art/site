import { prisma } from '@/lib/prisma';
import { APP_NAME } from '@/lib/brand';
import {
  DEFAULT_INTEGRATIONS,
  INTEGRATIONS_KEY,
  normalizeIntegrations,
  type DiscordChannel,
  type DiscordChannelKey,
  type Integrations,
} from '@/lib/integrationsShared';

export type { Integrations } from '@/lib/integrationsShared';

/**
 * Discord отвечает быстро; висеть на его таймауте приёму событий незачем.
 * Значение настраивается: с сервера в сети, где до discord.com далеко (или он
 * проходит через прокси), пяти секунд может не хватать.
 */
const TIMEOUT_MS = Number(process.env.DISCORD_TIMEOUT_MS ?? 10000);
/** Красный кружок репорта — тот же цвет, что у раздела в панели. */
const REPORT_COLOR = 0xef4444;
/** Бан — тот же красный; снятие блокировки помечаем зелёным. */
const BAN_COLOR = 0xef4444;
const UNBAN_COLOR = 0x22c55e;

export async function getIntegrations(projectId: string): Promise<Integrations> {
  const row = await prisma.panelSetting.findUnique({
    where: { projectId_key: { projectId, key: INTEGRATIONS_KEY } },
  });
  if (!row) return DEFAULT_INTEGRATIONS;

  try {
    return normalizeIntegrations(JSON.parse(row.value));
  } catch {
    return DEFAULT_INTEGRATIONS;
  }
}

export async function saveIntegrations(projectId: string, patch: unknown): Promise<Integrations> {
  const current = await getIntegrations(projectId);
  const input = (patch ?? {}) as { discord?: Partial<Record<DiscordChannelKey, unknown>> };
  const discord = input.discord ?? {};

  // Браузер шлёт только тот канал, который менял, — остальное берём из текущих.
  const merge = (key: DiscordChannelKey): DiscordChannel => ({
    ...current.discord[key],
    ...((discord[key] as object) ?? {}),
  });

  const next = normalizeIntegrations({
    discord: { reports: merge('reports'), bans: merge('bans') },
  });

  const value = JSON.stringify(next);
  await prisma.panelSetting.upsert({
    where: { projectId_key: { projectId, key: INTEGRATIONS_KEY } },
    create: { projectId, key: INTEGRATIONS_KEY, value },
    update: { value },
  });

  return next;
}

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

/**
 * Почему запрос не дошёл — по-русски и по делу.
 *
 * Таймаут и отказ соединения здесь почти всегда значат одно: с сервера панели
 * не открывается discord.com. Сам вебхук при этом рабочий, и подсказка «проверьте
 * адрес» уводит не туда — поэтому говорим прямо про доступ наружу.
 */
function describeError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  const code = (err as { cause?: { code?: string } })?.cause?.code ?? '';

  if (name === 'TimeoutError' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') {
    return `Discord не ответил за ${Math.round(TIMEOUT_MS / 1000)} с. Обычно это значит, что с сервера панели нет доступа к discord.com — блокировка провайдера или фаервол. Вебхук тут ни при чём.`;
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'Не удалось разрешить discord.com — на сервере панели не работает DNS.';
  }
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
    return 'Соединение с discord.com сброшено — его режет фаервол или провайдер.';
  }

  return err instanceof Error ? err.message : 'запрос не ушёл';
}

/**
 * Отправка в канал Discord. Ошибки не пробрасываются: уведомление — не повод
 * ронять приём события с игрового сервера.
 */
async function post(webhookUrl: string, embed: DiscordEmbed): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: APP_NAME, embeds: [embed] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.ok) return { ok: true };

    // 401/404 — вебхук удалён или переписан в настройках канала; остальное — на стороне Discord.
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return {
        ok: false,
        error: `Discord ответил ${res.status}: такого вебхука уже нет. Создайте его заново в настройках канала и вставьте новый адрес.`,
      };
    }
    if (res.status === 429) return { ok: false, error: 'Discord придержал сообщение: слишком часто (429).' };

    return { ok: false, error: `Discord ответил ${res.status}` };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

/**
 * Отправка в канал проекта. Молча выходит, если вебхук не привязан или канал
 * выключен: это нормальное состояние настроек, а не ошибка.
 */
async function notify(
  projectId: string,
  channel: DiscordChannelKey,
  embed: DiscordEmbed,
): Promise<void> {
  const { discord } = await getIntegrations(projectId);
  const target = discord[channel];
  if (!target.webhookUrl || !target.enabled) return;

  const sent = await post(target.webhookUrl, embed);
  if (!sent.ok) console.error(`Discord (${channel}): сообщение не доставлено — ${sent.error}`);
}

export interface ReportNotice {
  targetName: string;
  targetSteamId: string;
  reporterName: string;
  subject: string | null;
  message: string | null;
  serverName: string;
}

/** Уведомление о новом репорте. */
export async function notifyReport(projectId: string, report: ReportNotice): Promise<void> {
  const fields = [
    { name: 'На кого', value: `${report.targetName}\n\`${report.targetSteamId}\``, inline: true },
    { name: 'От кого', value: report.reporterName, inline: true },
    { name: 'Сервер', value: report.serverName, inline: true },
  ];

  if (report.subject) fields.push({ name: 'Причина', value: report.subject.slice(0, 1024), inline: false });
  if (report.message) fields.push({ name: 'Комментарий', value: report.message.slice(0, 1024), inline: false });

  await notify(projectId, 'reports', {
    title: 'Новый репорт',
    color: REPORT_COLOR,
    fields,
    footer: { text: APP_NAME },
    timestamp: new Date().toISOString(),
  });
}

export interface BanNotice {
  name: string;
  steamId: string;
  reason: string | null;
  /** Кто выдал бан; null — бан пришёл из игры и автора там не узнать. */
  admin: string | null;
  serverName: string;
}

/** Уведомление о новой блокировке — первая половина бан-листа. */
export async function notifyBan(projectId: string, ban: BanNotice): Promise<void> {
  const fields = [
    { name: 'Игрок', value: `${ban.name}\n\`${ban.steamId}\``, inline: true },
    { name: 'Сервер', value: ban.serverName, inline: true },
    { name: 'Выдал', value: ban.admin ?? 'из игры', inline: true },
  ];

  if (ban.reason) fields.push({ name: 'Причина', value: ban.reason.slice(0, 1024), inline: false });

  await notify(projectId, 'bans', {
    title: 'Новая блокировка',
    color: BAN_COLOR,
    fields,
    footer: { text: APP_NAME },
    timestamp: new Date().toISOString(),
  });
}

/** Снятие блокировки — вторая половина бан-листа, тот же канал. */
export async function notifyUnban(
  projectId: string,
  unban: { name: string; steamId: string; serverName: string },
): Promise<void> {
  await notify(projectId, 'bans', {
    title: 'Блокировка снята',
    color: UNBAN_COLOR,
    fields: [
      { name: 'Игрок', value: `${unban.name}\n\`${unban.steamId}\``, inline: true },
      { name: 'Сервер', value: unban.serverName, inline: true },
    ],
    footer: { text: APP_NAME },
    timestamp: new Date().toISOString(),
  });
}

/** Проверочное сообщение по кнопке «Отправить тест» в разделе «Интеграции». */
export async function notifyTest(
  webhookUrl: string,
  channel: DiscordChannelKey,
): Promise<{ ok: boolean; error?: string }> {
  const what = channel === 'bans' ? 'блокировки игроков' : 'репорты игроков';

  return post(webhookUrl, {
    title: 'Проверка связи',
    description: `Вебхук привязан. Сюда будут приходить ${what} из ${APP_NAME}.`,
    color: channel === 'bans' ? BAN_COLOR : REPORT_COLOR,
    footer: { text: APP_NAME },
    timestamp: new Date().toISOString(),
  });
}
