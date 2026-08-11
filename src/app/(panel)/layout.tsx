import { redirect } from 'next/navigation';
import { requireProjectUser } from '@/lib/auth';
import { getProjectState } from '@/lib/project';
import PanelShell from '@/components/PanelShell';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // Куку уже проверило middleware; здесь сверяем её с живой сессией в базе
  // и заодно требуем выбранный проект — без него в разделах смотреть нечего.
  const user = await requireProjectUser();

  const project = await getProjectState(user.projectId);
  // Проект мог исчезнуть у нас под ногами (владелец удалил, сотрудника убрали).
  if (!project) redirect('/welcome');

  return (
    <PanelShell project={project} user={user}>
      {children}
    </PanelShell>
  );
}
