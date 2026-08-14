import { prisma } from '@/lib/prisma';
import {
  DEFAULT_HIGHLIGHT_COLOR,
  HIGHLIGHT_COLOR_KEY,
  type ChatKeyword,
  type ChatMessage,
} from '@/lib/chatShared';

/** Сервер считается подключённым, если heartbeat приходил не дольше двух интервалов назад. */
const SERVER_ONLINE_WINDOW_MS = 90_000;
const MESSAGE_LIMIT = 100;

/** Плагин шлёт чат пачками: одно событие chat_message содержит до 20 сообщений. */
interface BufferedMessage {
  steamId?: string;
  name?: string;
  channel?: string;
  message?: string;
  timestamp?: number;
}

export async function isAnyServerConnected(projectId: string): Promise<boolean> {
  const since = new Date(Date.now() - SERVER_ONLINE_WINDOW_MS);
  const count = await prisma.server.count({
    where: { projectId, lastHeartbeatAt: { gte: since } },
  });
  return count > 0;
}

export async function listChatMessages(projectId: string): Promise<ChatMessage[]> {
  const events = await prisma.playerEvent.findMany({
    where: { projectId, type: 'chat_message' },
    orderBy: { createdAt: 'desc' },
    take: 40,
    include: { server: { select: { name: true } } },
  });

  const messages: ChatMessage[] = [];

  for (const event of events) {
    const payload = (event.payload ?? {}) as unknown as { messages?: BufferedMessage[] };
    const batch = Array.isArray(payload.messages) ? payload.messages : [];

    batch.forEach((m, index) => {
      if (!m?.message) return;
      messages.push({
        id: `${event.id}:${index}`,
        steamId: m.steamId ?? null,
        name: m.name ?? m.steamId ?? 'Неизвестный',
        channel: (m.channel ?? 'Global').toUpperCase(),
        message: m.message,
        serverName: event.server?.name ?? '—',
        timestamp: m.timestamp
          ? new Date(m.timestamp * 1000).toISOString()
          : event.createdAt.toISOString(),
      });
    });
  }

  // Старые сверху, как в живом чате.
  messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return messages.slice(-MESSAGE_LIMIT);
}

export async function getHighlightColor(projectId: string): Promise<string> {
  const row = await prisma.panelSetting.findUnique({
    where: { projectId_key: { projectId, key: HIGHLIGHT_COLOR_KEY } },
  });
  return row?.value ?? DEFAULT_HIGHLIGHT_COLOR;
}

export async function setHighlightColor(projectId: string, color: string): Promise<string> {
  await prisma.panelSetting.upsert({
    where: { projectId_key: { projectId, key: HIGHLIGHT_COLOR_KEY } },
    create: { projectId, key: HIGHLIGHT_COLOR_KEY, value: color },
    update: { value: color },
  });
  return color;
}

/**
 * Сообщение из панели в игровой чат.
 *
 * Команда `say` кладётся каждому живому серверу проекта (или одному выбранному),
 * а её копия сразу пишется в ленту событием chat_message — иначе автор не увидел бы
 * собственную реплику до следующего опроса плагина.
 *
 * Возвращает, на сколько серверов ушло: ноль означает, что ни один плагин не на связи.
 */
export async function sendChatMessage(
  projectId: string,
  author: string,
  text: string,
  serverId?: string | null,
): Promise<number> {
  const since = new Date(Date.now() - SERVER_ONLINE_WINDOW_MS);

  const servers = await prisma.server.findMany({
    where: {
      projectId,
      lastHeartbeatAt: { gte: since },
      ...(serverId ? { id: serverId } : {}),
    },
    select: { id: true },
  });
  if (servers.length === 0) return 0;

  const timestamp = Math.floor(Date.now() / 1000);

  await prisma.$transaction([
    prisma.serverCommand.createMany({
      data: servers.map((server) => ({
        projectId,
        serverId: server.id,
        type: 'say',
        // Команда не про конкретного игрока, но поле в схеме обязательное.
        steamId: '0',
        reason: `${author}: ${text}`,
      })),
    }),
    prisma.playerEvent.createMany({
      data: servers.map((server) => ({
        projectId,
        serverId: server.id,
        type: 'chat_message',
        payload: {
          messages: [
            { steamId: null, name: author, channel: 'PANEL', message: text, timestamp },
          ],
        },
      })),
    }),
  ]);

  return servers.length;
}

export async function listKeywords(projectId: string): Promise<ChatKeyword[]> {
  const rows = await prisma.chatKeyword.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => ({ id: r.id, word: r.word }));
}
