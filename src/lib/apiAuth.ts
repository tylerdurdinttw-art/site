import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

/**
 * Проверка сессии для обработчиков /api.
 *
 * Подпись куки уже проверило middleware, но оно живёт в edge-рантайме и в базу
 * не ходит. Здесь кука сверяется с живой строкой в таблице sessions — без этого
 * значение, снятое с браузера до выхода, работало бы до конца своего срока.
 *
 * Возвращает готовый 401 либо null, если запрос можно обслуживать.
 */
export async function requireApiUser(): Promise<NextResponse | null> {
  if (await getCurrentUser()) return null;
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}
