import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { accessStateOf } from '@/lib/accessShared';
import { isDeveloper } from '@/lib/devShared';
import type { SessionUser } from '@/lib/authShared';
import type { PermissionKey } from '@/lib/permissions';

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

  // Оплаченный срок вышел — данные проекта закрыты вместе с его разделами.
  const project = await prisma.project.findUnique({
    where: { id: user.projectId },
    select: { accessExpiresAt: true },
  });
  if (!accessStateOf(project?.accessExpiresAt ?? null).active) {
    return NextResponse.json({ error: 'Доступ к панели закончился.' }, { status: 402 });
  }

  return { user, projectId: user.projectId };
}

/**
 * Проверка права сотрудника. Владелец проходит всегда: его права не редактируются
 * и по смыслу полные. Возвращает готовый 403 либо null, если действие разрешено.
 */
export async function requirePermission(
  ctx: ApiContext,
  key: PermissionKey,
): Promise<NextResponse | null> {
  const staff = await prisma.staff.findFirst({
    where: { projectId: ctx.projectId, userId: ctx.user.id },
    select: { role: true, permissions: true },
  });

  if (!staff) return NextResponse.json({ error: 'Вас нет в списке сотрудников.' }, { status: 403 });
  if (staff.role === 'owner' || staff.permissions.includes(key)) return null;

  return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
}

/**
 * Проверка для эндпоинтов раздела «Разработка». Права проекта тут ни при чём:
 * доступ определяется только логином из списка разработчиков сайта. Срок доступа
 * проекта здесь намеренно не смотрим — продлевать его нужно в том числе тогда,
 * когда он уже вышел.
 *
 * Отказ отдаётся как 404: посторонним незачем знать, что раздел вообще есть.
 */
export async function requireDeveloper(): Promise<SessionUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isDeveloper(user.login)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return user;
}

/** Узкий тип-страж: NextResponse из requireApiProject нужно вернуть, а не разбирать. */
export function isDenied<T>(value: T | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
