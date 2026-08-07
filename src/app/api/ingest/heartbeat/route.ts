import { NextResponse } from 'next/server';
import { authenticateIngest, authErrorResponse } from '@/lib/ingestAuth';
import { prisma } from '@/lib/prisma';
import { lookupMany } from '@/lib/geo';
import { resolveClientType } from '@/lib/players';
import type { HeartbeatBody } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Игрок помечается offline, пропустив два heartbeat подряд. */
const MISSED_HEARTBEATS_TO_OFFLINE = 2;

export async function POST(req: Request) {
  const auth = await authenticateIngest(req);
  if (!auth.ok) return authErrorResponse(auth);

  let body: HeartbeatBody;
  try {
    body = JSON.parse(auth.rawBody) as HeartbeatBody;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (body.serverId !== auth.server.id) {
    return NextResponse.json({ error: 'serverId mismatch' }, { status: 403 });
  }
  if (!Array.isArray(body.players)) {
    return NextResponse.json({ error: 'players must be an array' }, { status: 400 });
  }

  await prisma.server.update({
    where: { id: auth.server.id },
    data: {
      name: body.serverName || auth.server.name,
      hostname: body.hostname ?? auth.server.hostname,
      maxPlayers: body.maxPlayers ?? auth.server.maxPlayers,
      uptimeSec: body.uptimeSec ?? auth.server.uptimeSec,
      queuedPlayers: Math.max(0, body.queuedPlayers ?? 0),
      joiningPlayers: Math.max(0, body.joiningPlayers ?? 0),
      seed: Number.isFinite(body.seed) ? Math.trunc(body.seed as number) : auth.server.seed,
      worldSize: Number.isFinite(body.worldSize)
        ? Math.trunc(body.worldSize as number)
        : auth.server.worldSize,
      lastHeartbeatAt: new Date(),
    },
  });

  // Гео подтягиваем до транзакции: чтение .mmdb + запись в ip_info кешируются на 30 дней.
  await lookupMany(body.players.map((p) => p.ip));

  const now = new Date();
  const presentSteamIds: string[] = [];

  for (const p of body.players) {
    if (!p?.steamId || !p?.name) continue;
    presentSteamIds.push(p.steamId);

    const clientType = resolveClientType(p.steamId, p.licensed);
    const ownerSteamId = p.ownerSteamId ?? p.steamId;
    // Команды больше 8 человек в Rust не бывает, но верхнюю границу держим с запасом.
    const teamSize = Math.min(50, Math.max(1, Math.trunc(p.teamSize ?? 1)));
    const language = p.language ? p.language.slice(0, 8).toLowerCase() : null;

    const player = await prisma.player.upsert({
      where: { steamId: p.steamId },
      create: {
        steamId: p.steamId,
        name: p.name,
        clientType,
        status: p.isSleeping ? 'sleeping' : 'online',
        serverId: auth.server.id,
        ip: p.ip,
        ping: p.ping ?? 0,
        isAfk: Boolean(p.isAfk),
        teamSize,
        language,
        ownerSteamId,
        isFamilyShare: ownerSteamId !== p.steamId,
        authLevel: p.authLevel ?? 0,
        lastSeenAt: now,
        missedHeartbeats: 0,
      },
      update: {
        name: p.name,
        clientType,
        status: p.isSleeping ? 'sleeping' : 'online',
        serverId: auth.server.id,
        ip: p.ip,
        ping: p.ping ?? 0,
        isAfk: Boolean(p.isAfk),
        teamSize,
        // Язык приходит не из каждой сборки клиента: пустое значение не затирает известное.
        ...(language ? { language } : {}),
        ownerSteamId,
        isFamilyShare: ownerSteamId !== p.steamId,
        authLevel: p.authLevel ?? 0,
        lastSeenAt: now,
        missedHeartbeats: 0,
      },
    });

    // Сессия по паре (игрок, IP): открываем, если открытой с этим IP ещё нет.
    const openSession = await prisma.playerSession.findFirst({
      where: { playerId: player.id, endedAt: null },
    });

    if (!openSession) {
      await prisma.playerSession.create({
        data: {
          playerId: player.id,
          steamId: p.steamId,
          serverId: auth.server.id,
          ip: p.ip,
          startedAt: new Date(now.getTime() - (p.connectedSec ?? 0) * 1000),
        },
      });
    } else if (openSession.ip !== p.ip) {
      // IP сменился без дисконнекта — закрываем старую сессию, открываем новую.
      await prisma.playerSession.update({
        where: { id: openSession.id },
        data: {
          endedAt: now,
          durationSec: Math.round((now.getTime() - openSession.startedAt.getTime()) / 1000),
        },
      });
      await prisma.playerSession.create({
        data: {
          playerId: player.id,
          steamId: p.steamId,
          serverId: auth.server.id,
          ip: p.ip,
          startedAt: now,
        },
      });
    }
  }

  // Всех, кого нет в снапшоте, штрафуем на один пропуск.
  await prisma.player.updateMany({
    where: {
      serverId: auth.server.id,
      steamId: { notIn: presentSteamIds },
      status: { in: ['online', 'sleeping'] },
    },
    data: { missedHeartbeats: { increment: 1 } },
  });

  const dropped = await prisma.player.findMany({
    where: {
      serverId: auth.server.id,
      status: { in: ['online', 'sleeping'] },
      missedHeartbeats: { gte: MISSED_HEARTBEATS_TO_OFFLINE },
    },
    select: { id: true },
  });

  if (dropped.length) {
    const ids = dropped.map((d) => d.id);
    await prisma.player.updateMany({
      where: { id: { in: ids } },
      data: { status: 'offline', isAfk: false, ping: 0 },
    });

    const stale = await prisma.playerSession.findMany({
      where: { playerId: { in: ids }, endedAt: null },
    });
    for (const s of stale) {
      await prisma.playerSession.update({
        where: { id: s.id },
        data: {
          endedAt: now,
          durationSec: Math.round((now.getTime() - s.startedAt.getTime()) / 1000),
        },
      });
    }
  }

  return NextResponse.json({ ok: true, accepted: presentSteamIds.length });
}
