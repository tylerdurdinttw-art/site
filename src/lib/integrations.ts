import { prisma } from '@/lib/prisma';
import { APP_NAME } from '@/lib/brand';
import {
  DEFAULT_INTEGRATIONS,
  INTEGRATIONS_KEY,
  normalizeIntegrations,
  type Integrations,
} from '@/lib/integrationsShared';

export type { Integrations } from '@/lib/integrationsShared';

/** Discord отвечает быстро; висеть на его таймауте приёму событий незачем. */
const TIMEOUT_MS = 5000;
/** Красный кружок репорта — тот же цвет, что у раздела в панели. */
const REPORT_COLOR = 0xef4444;

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
  const input = (patch ?? {}) as Partial<Record<keyof Integrations, unknown>>;

  const next = normalizeIntegrations({
    discord: { ...current.discord, ...((input.discord as object) ?? {}) },
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

export interface ReportNotice {
  targetName: string;
  targetSteamId: string;
  reporterName: string;
  subject: string | null;
  message: string | null;
  serverName: string;
}

/** Уведомление о новом репорте. Молча выходит, если вебхук не привязан. */
export async function notifyReport(projectId: string, report: ReportNotice): Promise<void> {
  const { discord } = await getIntegrations(projectId);
  if (!discord.webhookUrl || !discord.reports) return;

  const fields = [
    { name: 'На кого', value: `${report.targetName}\n\`${report.targetSteamId}\``, inline: true },
    { name: 'От кого', value: report.reporterName, inline: true },
    { name: 'Сервер', value: report.serverName, inline: true },
  ];

  if (report.subject) fields.push({ name: 'Причина', value: report.subject.slice(0, 1024), inline: false });
  if (report.message) fields.push({ name: 'Комментарий', value: report.message.slice(0, 1024), inline: false });

  const sent = await post(discord.webhookUrl, {
    title: 'Новый репорт',
    color: REPORT_COLOR,
    fields,
    footer: { text: APP_NAME },
    timestamp: new Date().toISOString(),
  });

  if (!sent.ok) console.error(`Discord: репорт не доставлен — ${sent.error}`);
}

/** Проверочное сообщение по кнопке «Отправить тест» в разделе «Интеграции». */
export async function notifyTest(webhookUrl: string): Promise<{ ok: boolean; error?: string }> {
  return post(webhookUrl, {
    title: 'Проверка связи',
    description: `Вебхук привязан. Сюда будут приходить репорты игроков из ${APP_NAME}.`,
    color: REPORT_COLOR,
    footer: { text: APP_NAME },
    timestamp: new Date().toISOString(),
  });
}
