import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateSecret, normalizeCode, slugifyServerId } from '@/lib/pairing';
import { rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PairBody {
  code?: unknown;
  name?: unknown;
  hostname?: unknown;
  maxPlayers?: unknown;
}

/**
 * Обмен одноразового кода на ключи сервера.
 *
 * Единственный ingest-эндпоинт без HMAC-подписи: подписывать ещё нечем — секрет
 * выдаётся именно здесь. Роль пароля играет сам код: он живёт 15 минут и сгорает
 * после первого использования.
 */
export async function POST(req: Request) {
  const limit = rateLimit('pair:redeem', 30);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'too many attempts' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSec) } },
    );
  }

  let body: PairBody;
  try {
    body = (await req.json()) as PairBody;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (typeof body.code !== 'string' || !body.code.trim()) {
    return NextResponse.json({ error: 'Код не передан' }, { status: 400 });
  }

  const code = normalizeCode(body.code);
  const row = await prisma.pairingCode.findUnique({ where: { code } });

  if (!row) return NextResponse.json({ error: 'Код не найден' }, { status: 404 });
  if (row.usedAt) return NextResponse.json({ error: 'Код уже использован' }, { status: 409 });
  if (row.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Код просрочен, получите новый в панели' }, { status: 410 });
  }

  const name =
    typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : 'Rust server';
  const hostname = typeof body.hostname === 'string' ? body.hostname.slice(0, 120) : null;
  const maxPlayers =
    typeof body.maxPlayers === 'number' && Number.isFinite(body.maxPlayers)
      ? Math.max(0, Math.trunc(body.maxPlayers))
      : null;

  const serverKey = generateSecret();
  const serverSecret = generateSecret();

  // Код с привязкой к серверу — это переподключение: новую запись не заводим,
  // а перевыдаём ключи существующей. Данные и баны сервера остаются на месте.
  if (row.serverId) {
    const target = await prisma.server.findUnique({ where: { id: row.serverId } });
    if (!target) {
      return NextResponse.json({ error: 'Сервер удалён, получите новый код' }, { status: 410 });
    }

    const claimed = await prisma.pairingCode.updateMany({
      where: { code, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: 'Код уже использован' }, { status: 409 });
    }

    await prisma.server.update({
      where: { id: target.id },
      data: { name, hostname, maxPlayers, serverKey, serverSecret },
    });

    return NextResponse.json({ serverId: target.id, serverKey, serverSecret, serverName: name });
  }

  const serverId = slugifyServerId(name);

  // Код помечаем использованным в той же транзакции, что и создание сервера,
  // чтобы два параллельных запроса не создали два сервера по одному коду.
  const server = await prisma.$transaction(async (tx) => {
    const claimed = await tx.pairingCode.updateMany({
      where: { code, usedAt: null },
      data: { usedAt: new Date(), serverId },
    });
    if (claimed.count === 0) throw new Error('ALREADY_USED');

    return tx.server.create({
      data: { id: serverId, name, hostname, maxPlayers, serverKey, serverSecret },
    });
  }).catch((err: unknown) => {
    if (err instanceof Error && err.message === 'ALREADY_USED') return null;
    throw err;
  });

  if (!server) return NextResponse.json({ error: 'Код уже использован' }, { status: 409 });

  return NextResponse.json({
    serverId: server.id,
    serverKey,
    serverSecret,
    serverName: server.name,
  });
}
