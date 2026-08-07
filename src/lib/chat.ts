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

export async function isAnyServerConnected(): Promise<boolean> {
  const since = new Date(Date.now() - SERVER_ONLINE_WINDOW_MS);
  const count = await prisma.server.count({ where: { lastHeartbeatAt: { gte: since } } });
  return count > 0;
}

export async function listChatMessages(): Promise<ChatMessage[]> {
  const events = await prisma.playerEvent.findMany({
    where: { type: 'chat_message' },
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

export async function getHighlightColor(): Promise<string> {
  const row = await prisma.panelSetting.findUnique({ where: { key: HIGHLIGHT_COLOR_KEY } });
  return row?.value ?? DEFAULT_HIGHLIGHT_COLOR;
}

export async function setHighlightColor(color: string): Promise<string> {
  await prisma.panelSetting.upsert({
    where: { key: HIGHLIGHT_COLOR_KEY },
    create: { key: HIGHLIGHT_COLOR_KEY, value: color },
    update: { value: color },
  });
  return color;
}

export async function listKeywords(): Promise<ChatKeyword[]> {
  const rows = await prisma.chatKeyword.findMany({ orderBy: { createdAt: 'asc' } });
  return rows.map((r) => ({ id: r.id, word: r.word }));
}
