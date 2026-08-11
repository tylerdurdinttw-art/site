import { randomBytes, randomInt } from 'node:crypto';
import { prisma } from '@/lib/prisma';

/** Код живёт 15 минут и сгорает после первого использования. */
export const PAIRING_TTL_MS = 15 * 60 * 1000;

/** Без 0/O/1/I — код диктуют голосом и вводят руками. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GROUP = 4;
const GROUPS = 2;

export function generateCode(): string {
  const parts: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let part = '';
    for (let i = 0; i < GROUP; i++) part += ALPHABET[randomInt(ALPHABET.length)];
    parts.push(part);
  }
  return parts.join('-');
}

/** Приводим введённый код к каноническому виду: регистр и дефисы не важны. */
export function normalizeCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== GROUP * GROUPS) return clean;
  return `${clean.slice(0, GROUP)}-${clean.slice(GROUP)}`;
}

export function generateSecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * ID сервера из его имени: латиница и цифры, остальное схлопывается в дефис.
 * Кириллица и оформление вида «[ X1000000 ]» отбрасываются, поэтому при пустом
 * результате берём случайный суффикс.
 */
export function slugifyServerId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');

  const suffix = randomBytes(2).toString('hex');
  return base ? `${base}-${suffix}` : `server-${suffix}`;
}

/**
 * Новый код подключения. `targetServerId` задан при переподключении: тогда код
 * привязан к уже существующему серверу и обмен не заводит новую запись,
 * а перевыдаёт ключи этой (см. `POST /api/pair`).
 */
export async function createPairingCode(projectId: string, targetServerId?: string) {
  // Подчищаем протухшие коды, чтобы таблица не росла.
  await prisma.pairingCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const existing = await prisma.pairingCode.findUnique({ where: { code } });
    if (existing) continue;
    return prisma.pairingCode.create({
      data: { code, projectId, expiresAt, serverId: targetServerId ?? null },
    });
  }

  throw new Error('не удалось сгенерировать уникальный код');
}
