import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { authenticateIngest, authErrorResponse } from '@/lib/ingestAuth';
import { prisma } from '@/lib/prisma';
import { lookupIp } from '@/lib/geo';
import { resolveClientType } from '@/lib/players';
import { publish } from '@/lib/eventBus';
import { recordPlayerMessages } from '@/lib/checks';
import { resolveBanAdmin } from '@/lib/bans';
import { dropReportsFor } from '@/lib/reports';
import { notifyReport } from '@/lib/integrations';
import { getSettings } from '@/lib/settings';
import type { IngestEventBody, PanelEvent, PanelEventType } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KNOWN_TYPES: PanelEventType[] = [
  'player_connected',
  'player_disconnected',
  'player_reported',
  'player_banned',
  'player_unbanned',
  'combat_log',
  'player_killed',
  'player_died',
  'chat_message',
  'violation',
  'sign_updated',
  'multiaccount_detected',
  'combat_anomaly',
  'discord_linked',
];

/** Окно поиска совпадений по IP для мультиаккаунта. */
const MULTIACCOUNT_WINDOW_DAYS = 30;

function str(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export async function POST(req: Request) {
  const auth = await authenticateIngest(req);
  if (!auth.ok) return authErrorResponse(auth);

  let body: IngestEventBody;
  try {
    body = JSON.parse(auth.rawBody) as IngestEventBody;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (body.serverId !== auth.server.id) {
    return NextResponse.json({ error: 'serverId mismatch' }, { status: 403 });
  }
  if (!KNOWN_TYPES.includes(body.type)) {
    return NextResponse.json({ error: `unknown event type: ${body.type}` }, { status: 400 });
  }

  const payload = (body.payload ?? {}) as Record<string, unknown>;
  const steamId = str(payload, 'steamId');
  const now = new Date();

  // Проект определяется сервером, который подписал запрос: плагин о проектах
  // ничего не знает и подставить чужой не может.
  const { projectId } = auth.server;

  const player = steamId
    ? await prisma.player.findUnique({ where: { projectId_steamId: { projectId, steamId } } })
    : null;

  // combat_log — только конверт для пачки: в журнал ложатся её строки,
  // а не сам конверт, иначе лог активности игрока забился бы им впустую.
  if (body.type !== 'combat_log') {
    await prisma.playerEvent.create({
      data: {
        projectId,
        serverId: auth.server.id,
        playerId: player?.id ?? null,
        steamId,
        type: body.type,
        payload: payload as unknown as Prisma.InputJsonObject,
      },
    });
  }

  const emit = (type: PanelEventType, eventPayload: Record<string, unknown>) => {
    const event: PanelEvent = {
      id: randomUUID(),
      type,
      projectId,
      serverId: auth.server.id,
      serverName: auth.server.name,
      timestamp: body.timestamp || Math.floor(Date.now() / 1000),
      payload: eventPayload,
    };
    publish(event);
  };

  switch (body.type) {
    case 'player_connected': {
      if (!steamId) break;

      const name = str(payload, 'name') ?? steamId;
      const ip = str(payload, 'ip');
      const ownerSteamId = str(payload, 'ownerSteamId') ?? steamId;
      const clientType = resolveClientType(steamId, payload.licensed as boolean | undefined);

      if (ip) await lookupIp(ip);

      const saved = await prisma.player.upsert({
        where: { projectId_steamId: { projectId, steamId } },
        create: {
          projectId,
          steamId,
          name,
          clientType,
          status: 'online',
          serverId: auth.server.id,
          ip,
          ping: num(payload, 'ping'),
          ownerSteamId,
          isFamilyShare: ownerSteamId !== steamId,
          authLevel: num(payload, 'authLevel'),
          lastSeenAt: now,
          missedHeartbeats: 0,
        },
        update: {
          name,
          clientType,
          status: 'online',
          serverId: auth.server.id,
          ip,
          ping: num(payload, 'ping'),
          ownerSteamId,
          isFamilyShare: ownerSteamId !== steamId,
          lastSeenAt: now,
          missedHeartbeats: 0,
          isAfk: false,
        },
      });

      if (ip) {
        const open = await prisma.playerSession.findFirst({
          where: { playerId: saved.id, endedAt: null },
        });
        if (!open) {
          await prisma.playerSession.create({
            data: {
              projectId,
              playerId: saved.id,
              steamId,
              serverId: auth.server.id,
              ip,
              startedAt: now,
            },
          });
        }
      }

      emit('player_connected', { steamId, name, ip });

      // Мультиаккаунт: другие SteamID с того же IP за последние 30 дней.
      if (ip) {
        const since = new Date(now.getTime() - MULTIACCOUNT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        const related = await prisma.playerSession.findMany({
          where: { projectId, ip, startedAt: { gte: since }, steamId: { not: steamId } },
          distinct: ['steamId'],
          select: { steamId: true },
        });

        if (related.length > 0) {
          const relatedSteamIds = related.map((r) => r.steamId);
          const mPayload = {
            steamId,
            name,
            ip,
            count: relatedSteamIds.length,
            relatedSteamIds,
          };
          await prisma.playerEvent.create({
            data: {
              projectId,
              serverId: auth.server.id,
              playerId: saved.id,
              steamId,
              type: 'multiaccount_detected',
              payload: mPayload,
            },
          });
          emit('multiaccount_detected', mPayload);
        }
      }
      break;
    }

    case 'player_disconnected': {
      if (!steamId || !player) break;

      await prisma.player.update({
        where: { id: player.id },
        data: { status: 'offline', isAfk: false, ping: 0, lastSeenAt: now },
      });

      const open = await prisma.playerSession.findFirst({
        where: { playerId: player.id, endedAt: null },
      });
      if (open) {
        await prisma.playerSession.update({
          where: { id: open.id },
          data: {
            endedAt: now,
            durationSec:
              num(payload, 'durationSec') ||
              Math.round((now.getTime() - open.startedAt.getTime()) / 1000),
          },
        });
      }

      emit('player_disconnected', { steamId, name: player.name, reason: str(payload, 'reason') });
      break;
    }

    case 'player_reported': {
      const targetSteamId = str(payload, 'targetSteamId');
      const reporterSteamId = str(payload, 'reporterSteamId') ?? steamId;
      if (!targetSteamId || !reporterSteamId) break;

      await prisma.report.create({
        data: {
          projectId,
          serverId: auth.server.id,
          reporterSteamId,
          reporterName: str(payload, 'reporterName'),
          targetSteamId,
          targetName: str(payload, 'targetName'),
          subject: str(payload, 'subject'),
          message: str(payload, 'message'),
          type: str(payload, 'type'),
        },
      });

      await prisma.player.updateMany({
        where: { projectId, steamId: targetSteamId },
        data: { reportsCount: { increment: 1 } },
      });

      // Дискорд-вебхук, если он привязан в «Интеграциях». Ошибки внутри гасятся:
      // недоступный канал не должен ломать приём события с игрового сервера.
      await notifyReport(projectId, {
        targetName: str(payload, 'targetName') ?? targetSteamId,
        targetSteamId,
        reporterName: str(payload, 'reporterName') ?? reporterSteamId,
        subject: str(payload, 'subject') ?? str(payload, 'type'),
        message: str(payload, 'message'),
        serverName: auth.server.name,
      });

      emit('player_reported', payload);
      break;
    }

    case 'player_banned': {
      if (!steamId) break;
      const reason = str(payload, 'reason');
      await prisma.ban.create({
        data: {
          projectId,
          serverId: auth.server.id,
          steamId,
          name: str(payload, 'name'),
          ip: str(payload, 'ip'),
          reason,
          admin: await resolveBanAdmin(projectId, steamId, reason, now),
        },
      });

      // «Удалять репорты после блокировки»: игрок уже наказан, жалобы на него не нужны.
      const settings = await getSettings(projectId);
      if (settings.reports.deleteAfterBan) await dropReportsFor(projectId, steamId);

      emit('player_banned', payload);
      break;
    }

    case 'player_unbanned': {
      if (!steamId) break;
      await prisma.ban.updateMany({
        where: { projectId, steamId, active: true },
        data: { active: false, unbannedAt: now },
      });
      emit('player_unbanned', payload);
      break;
    }

    /**
     * Пачка убийств и смертей. Каждое PvP-убийство даёт две строки: одну на
     * убийцу (`player_killed`), другую на погибшего (`player_died`), — так K/D
     * считается прямым подсчётом строк, без разбора payload соседней записи.
     * Отдельной таблицы под них нет: события и так лежат в player_events,
     * а карточка игрока смотрит только на последнюю неделю.
     */
    case 'combat_log': {
      const entries = Array.isArray(payload.entries) ? payload.entries : [];
      if (entries.length === 0) break;

      // Участники пачки — одним запросом: в замесе одни и те же ники повторяются,
      // и искать игрока на каждую строку было бы лишним.
      const actors = new Set<string>();
      for (const raw of entries) {
        const actor = raw && typeof raw === 'object' ? str(raw as Record<string, unknown>, 'steamId') : null;
        if (actor) actors.add(actor);
      }

      const known = await prisma.player.findMany({
        where: { projectId, steamId: { in: Array.from(actors) } },
        select: { id: true, steamId: true },
      });
      const playerIds = new Map(known.map((p) => [p.steamId, p.id]));

      const rows: Prisma.PlayerEventCreateManyInput[] = [];

      for (const raw of entries) {
        if (!raw || typeof raw !== 'object') continue;
        const entry = raw as Record<string, unknown>;

        const actor = str(entry, 'steamId');
        if (!actor) continue;

        const kind = str(entry, 'kind');
        if (kind !== 'kill' && kind !== 'death') continue;

        const at = num(entry, 'timestamp');
        rows.push({
          projectId,
          serverId: auth.server.id,
          playerId: playerIds.get(actor) ?? null,
          steamId: actor,
          type: kind === 'kill' ? 'player_killed' : 'player_died',
          payload: entry as Prisma.InputJsonObject,
          // Пачка могла пролежать в буфере плагина до 15 секунд — берём время события.
          ...(at > 0 ? { createdAt: new Date(at * 1000) } : {}),
        });
      }

      if (rows.length > 0) await prisma.playerEvent.createMany({ data: rows });

      emit('combat_log', { count: rows.length });
      break;
    }

    // Игрок назвал свой дискорд командой /ds после вызова на проверку.
    case 'discord_linked': {
      if (!steamId || !player) break;

      const discord = str(payload, 'discord');
      if (!discord) break;

      await prisma.player.update({
        where: { id: player.id },
        data: { discord: discord.slice(0, 64) },
      });

      emit('discord_linked', { steamId, name: player.name, discord });
      break;
    }

    case 'violation':
    case 'combat_anomaly': {
      if (!steamId) break;
      await prisma.violation.create({
        data: {
          projectId,
          serverId: auth.server.id,
          playerId: player?.id ?? null,
          steamId,
          type: str(payload, 'type') ?? body.type,
          amount: num(payload, 'amount'),
          count: Math.max(1, num(payload, 'count')),
        },
      });
      emit(body.type, payload);
      break;
    }

    // Чат уже лёг в player_events; здесь только раскладываем сообщения
    // проверяемых игроков по их приватным чатам проверки.
    case 'chat_message': {
      const batch = payload.messages;
      if (Array.isArray(batch)) {
        await recordPlayerMessages(projectId, batch as Parameters<typeof recordPlayerMessages>[1]);
      }
      emit('chat_message', payload);
      break;
    }

    // sign_updated — на этом этапе только сохраняется в player_events.
    default:
      emit(body.type, payload);
      break;
  }

  return NextResponse.json({ ok: true });
}
