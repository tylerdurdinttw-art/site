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

/** Discord отвечает быстро; висеть на его таймауте приёму событий незачем. */
const TIMEOUT_MS = 5000;
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

    if (!res.ok) return { ok: false, error: `Discord ответил ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'запрос не ушёл' };
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
