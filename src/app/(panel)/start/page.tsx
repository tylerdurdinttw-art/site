import { redirect } from 'next/navigation';
import { requireProjectUser } from '@/lib/auth';
import { getProjectState } from '@/lib/project';
import GettingStarted from '@/components/GettingStarted';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function StartPage() {
  const user = await requireProjectUser();
  const project = await getProjectState(user.projectId);
  if (!project) redirect('/welcome');

  return <GettingStarted initial={project} />;
}
