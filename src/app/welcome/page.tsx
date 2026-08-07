import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getProjectState } from '@/lib/project';
import CreateProjectForm from '@/components/CreateProjectForm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Первый экран панели: проект ещё не создан. Если он есть — сюда заходить незачем. */
export default async function WelcomePage() {
  await requireUser();

  const project = await getProjectState();
  if (project) redirect(project.done ? '/players' : '/start');

  return (
    <main className="dot-grid flex min-h-screen items-center justify-center px-4 py-16">
      <CreateProjectForm />
    </main>
  );
}
