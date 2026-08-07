import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getProjectState } from '@/lib/project';
import PanelShell from '@/components/PanelShell';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // Куку уже проверило middleware; здесь сверяем её с живой сессией в базе.
  const user = await requireUser();

  const project = await getProjectState();
  // Без проекта показывать нечего — весь раздел живёт вокруг него.
  if (!project) redirect('/welcome');

  return (
    <PanelShell project={project} user={user}>
      {children}
    </PanelShell>
  );
}
