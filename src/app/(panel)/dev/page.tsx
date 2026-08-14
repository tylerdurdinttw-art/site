import { notFound } from 'next/navigation';
import DevView from '@/components/DevView';
import { requireUser } from '@/lib/auth';
import { isDeveloper } from '@/lib/devShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Раздел «Разработка». Проект здесь не нужен — рычаги общие для сайта, поэтому
 * requireUser, а не requireProjectUser. Посторонним отвечаем 404: знать о разделе
 * им незачем, а сам список разработчиков лежит в lib/devShared.ts.
 */
export default async function DevPage() {
  const user = await requireUser();
  if (!isDeveloper(user.login)) notFound();

  return <DevView login={user.login} />;
}
