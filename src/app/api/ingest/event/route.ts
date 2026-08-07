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

  const player = steamId
    ? await prisma.player.findUnique({ where: { steamId } })
    : null;

  await prisma.playerEvent.create({
    data: {
      serverId: auth.server.id,
      playerId: player?.id ?? null,
      steamId,
      type: body.type,
      payload: payload as unknown as Prisma.InputJsonObject,
    },
  });

  const emit = (type: PanelEventType, eventPayload: Record<string, unknown>) => {
    const event: PanelEvent = {
      id: randomUUID(),
      type,
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
        where: { steamId },
        create: {
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
            data: { playerId: saved.id, steamId, serverId: auth.server.id, ip, startedAt: now },
          });
        }
      }

      emit('player_connected', { steamId, name, ip });

      // Мультиаккаунт: другие SteamID с того же IP за последние 30 дней.
      if (ip) {
        const since = new Date(now.getTime() - MULTIACCOUNT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        const related = await prisma.playerSession.findMany({
          where: { ip, startedAt: { gte: since }, steamId: { not: steamId } },
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
        where: { steamId: targetSteamId },
        data: { reportsCount: { increment: 1 } },
      });

      emit('player_reported', payload);
      break;
    }

    case 'player_banned': {
      if (!steamId) break;
      const reason = str(payload, 'reason');
      await prisma.ban.create({
        data: {
          serverId: auth.server.id,
          steamId,
          name: str(payload, 'name'),
          ip: str(payload, 'ip'),
          reason,
          admin: await resolveBanAdmin(steamId, reason, now),
        },
      });

      // «Удалять репорты после блокировки»: игрок уже наказан, жалобы на него не нужны.
      const settings = await getSettings();
      if (settings.reports.deleteAfterBan) await dropReportsFor(steamId);

      emit('player_banned', payload);
      break;
    }

    case 'player_unbanned': {
      if (!steamId) break;
      await prisma.ban.updateMany({
        where: { steamId, active: true },
        data: { active: false, unbannedAt: now },
      });
      emit('player_unbanned', payload);
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
        await recordPlayerMessages(batch as Parameters<typeof recordPlayerMessages>[0]);
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
