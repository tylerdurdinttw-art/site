import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getProjectState } from '@/lib/project';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Точка входа. Куда попадёт пользователь, зависит от состояния проекта:
 * проекта нет — экран создания, онбординг не закрыт — «Начало работы»,
 * иначе рабочий раздел с игроками.
 */
export default async function RootPage() {
  await requireUser();

  const project = await getProjectState();

  if (!project) redirect('/welcome');
  if (!project.done) redirect('/start');
  redirect('/players');
}
