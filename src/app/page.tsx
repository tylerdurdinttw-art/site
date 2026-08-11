import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getProjectState } from '@/lib/project';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Точка входа. Куда попадёт пользователь, зависит от его проекта:
 * проекта нет — экран выбора, онбординг не закрыт — «Начало работы»,
 * иначе рабочий раздел с игроками.
 */
export default async function RootPage() {
  const user = await requireUser();

  const project = await getProjectState(user.projectId);

  if (!project) redirect('/welcome');
  if (!project.done) redirect('/start');
  redirect('/players');
}
