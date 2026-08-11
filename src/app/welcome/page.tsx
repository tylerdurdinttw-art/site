import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getProjectState } from '@/lib/project';
import WelcomeChoice from '@/components/WelcomeChoice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Развилка после регистрации: свой проект или чужой по коду приглашения.
 * У кого проект уже есть, тому здесь делать нечего.
 */
export default async function WelcomePage() {
  const user = await requireUser();

  const project = await getProjectState(user.projectId);
  if (project) redirect(project.done ? '/players' : '/start');

  return (
    <main className="dot-grid flex min-h-screen items-center justify-center px-4 py-16">
      <WelcomeChoice login={user.login} />
    </main>
  );
}
