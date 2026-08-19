import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { checkNumber } from '@/lib/checksShared';
import type {
  ActiveCheck,
  CheckHistoryFilter,
  CheckHistoryItem,
  CheckMessage,
  CheckOutcome,
  CheckRoomData,
} from '@/lib/checksShared';

/** Тип команды панель -> плагин: проверки и связанные с ними санкции. */
export type CheckCommandType =
  | 'unban'
  | 'check'
  | 'check_banner'
  | 'check_banner_hide'
  | 'check_pm'
  | 'check_result'
  | 'check_announce'
  | 'check_end'
  | 'ban'
  | 'ban_team';

/** Сколько сообщений переписки отдаётся в док. */
const MESSAGE_LIMIT = 200;

/** Кладёт команду в очередь плагина. Плагин заберёт её ближайшим опросом. */
export async function queueCommand(
  projectId: string,
  serverId: string,
  type: CheckCommandType,
  steamId: string,
  reason = '',
  admin: string | null = null,
): Promise<void> {
  await prisma.serverCommand.create({
    data: { projectId, serverId, type, steamId, reason, admin },
  });
}

function toMessage(row: {
  id: string;
  from: string;
  channel: string | null;
  text: string;
  createdAt: Date;
}): CheckMessage {
  return {
    id: row.id,
    from: row.from === 'panel' ? 'panel' : 'player',
    channel: row.channel,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listActiveChecks(projectId: string): Promise<ActiveCheck[]> {
  const rows = await prisma.playerCheck.findMany({
    where: { projectId, status: 'active' },
    orderBy: { startedAt: 'asc' },
    include: {
      server: { select: { name: true } },
      messages: { orderBy: { createdAt: 'asc' }, take: MESSAGE_LIMIT },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    steamId: row.steamId,
    name: row.name,
    serverId: row.serverId,
    serverName: row.server?.name ?? '—',
    startedAt: row.startedAt.toISOString(),
    bannerVisible: row.bannerVisible,
    messages: row.messages.map(toMessage),
  }));
}

/** Сколько проверок показывает раздел «Проверки». */
const HISTORY_LIMIT = 200;

function historyWhere(projectId: string, filter: CheckHistoryFilter): Prisma.PlayerCheckWhereInput {
  switch (filter) {
    case 'active':
      return { projectId, status: 'active' };
    case 'finished':
      return { projectId, status: 'finished' };
    case 'banned':
      return { projectId, outcome: { in: ['ban', 'team_ban'] } };
    case 'clean':
      return { projectId, outcome: 'passed' };
    default:
      return { projectId };
  }
}

/**
 * Список проверок для раздела «Проверки»: свежие сверху.
 * Дискорд берётся из карточки игрока — его называет сам игрок командой /ds.
 */
export async function listCheckHistory(
  projectId: string,
  filter: CheckHistoryFilter,
): Promise<CheckHistoryItem[]> {
  const rows = await prisma.playerCheck.findMany({
    where: historyWhere(projectId, filter),
    orderBy: { startedAt: 'desc' },
    take: HISTORY_LIMIT,
    include: {
      server: { select: { name: true } },
      player: { select: { discord: true } },
      _count: { select: { messages: true } },
    },
  });

  if (rows.length === 0) return [];

  // Бейдж «забанен сейчас» — это текущее состояние игрока, а не итог этой проверки:
  // игрок мог пройти проверку и получить бан позже, и наоборот.
  const banned = await prisma.ban.findMany({
    where: { projectId, active: true, steamId: { in: rows.map((r) => r.steamId) } },
    select: { steamId: true },
    distinct: ['steamId'],
  });
  const bannedNow = new Set(banned.map((b) => b.steamId));

  return rows.map((row) => ({
    id: row.id,
    steamId: row.steamId,
    name: row.name,
    admin: row.admin,
    serverName: row.server?.name ?? '—',
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    outcome: (row.outcome as CheckOutcome | null) ?? null,
    reason: row.reason,
    discord: row.player?.discord ?? null,
    bannedNow: bannedNow.has(row.steamId),
    messagesCount: row._count.messages,
  }));
}

/** Проверка целиком — для её отдельной страницы. null — такой проверки нет. */
export async function getCheckRoom(
  projectId: string,
  checkId: string,
): Promise<CheckRoomData | null> {
  const row = await prisma.playerCheck.findUnique({
    where: { id: checkId },
    include: {
      server: { select: { name: true } },
      messages: { orderBy: { createdAt: 'asc' }, take: MESSAGE_LIMIT },
    },
  });
  // Чужая проверка для этого проекта — та же «не найдена»: подтверждать
  // существование id из соседнего проекта незачем.
  if (!row || row.projectId !== projectId) return null;

  return {
    id: row.id,
    number: checkNumber(row.id),
    steamId: row.steamId,
    name: row.name,
    admin: row.admin,
    serverId: row.serverId,
    serverName: row.server?.name ?? '—',
    active: row.status === 'active',
    bannerVisible: row.bannerVisible,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    outcome: (row.outcome as CheckOutcome | null) ?? null,
    reason: row.reason,
    messages: row.messages.map(toMessage),
  };
}

/** Переписка одной проверки — для карточки в списке. */
export async function getCheckMessages(
  projectId: string,
  checkId: string,
): Promise<CheckMessage[] | null> {
  const check = await prisma.playerCheck.findUnique({
    where: { id: checkId },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: MESSAGE_LIMIT } },
  });
  if (!check || check.projectId !== projectId) return null;
  return check.messages.map(toMessage);
}

/** Проверка проекта по id. null — её нет или она принадлежит другому проекту. */
export async function findCheck(projectId: string, checkId: string) {
  const check = await prisma.playerCheck.findUnique({ where: { id: checkId } });
  return check && check.projectId === projectId ? check : null;
}

/**
 * Записывает сообщения игроков в чаты активных проверок.
 * Вызывается из ingest при разборе пачки chat_message.
 */
export async function recordPlayerMessages(
  projectId: string,
  batch: { steamId?: string; message?: string; channel?: string; timestamp?: number }[],
): Promise<void> {
  const steamIds = Array.from(
    new Set(batch.map((m) => m?.steamId).filter((id): id is string => Boolean(id))),
  );
  if (steamIds.length === 0) return;

  const checks = await prisma.playerCheck.findMany({
    where: { projectId, status: 'active', steamId: { in: steamIds } },
    select: { id: true, steamId: true },
  });
  if (checks.length === 0) return;

  const checkBySteamId = new Map(checks.map((c) => [c.steamId, c.id]));
  const now = new Date();

  const data = batch.flatMap((m) => {
    if (!m?.steamId || !m.message) return [];
    const checkId = checkBySteamId.get(m.steamId);
    if (!checkId) return [];
    return [
      {
        checkId,
        from: 'player',
        channel: m.channel ?? null,
        text: m.message.slice(0, 500),
        createdAt: m.timestamp ? new Date(m.timestamp * 1000) : now,
      },
    ];
  });

  if (data.length > 0) await prisma.checkMessage.createMany({ data });
}
