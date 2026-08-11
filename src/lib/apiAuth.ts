import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import type { SessionUser } from '@/lib/authShared';

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

/** Вошедший пользователь вместе с проектом, данные которого он вправе смотреть. */
export interface ApiContext {
  user: SessionUser;
  projectId: string;
}

/**
 * То же, что requireApiUser, но ещё и достаёт проект. Через него проходит любой
 * эндпоинт, который читает или пишет данные проекта: projectId из него — это
 * единственная граница между проектами, поэтому подставлять его в запросы
 * обязательно, даже когда кажется, что выборка и так «своя».
 *
 * Возвращает готовый ответ с ошибкой либо контекст запроса.
 */
export async function requireApiProject(): Promise<ApiContext | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!user.projectId) {
    return NextResponse.json({ error: 'Проект не выбран.' }, { status: 409 });
  }
  return { user, projectId: user.projectId };
}

/** Узкий тип-страж: NextResponse из requireApiProject нужно вернуть, а не разбирать. */
export function isDenied(value: ApiContext | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
