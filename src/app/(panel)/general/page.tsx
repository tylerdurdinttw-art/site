import { redirect } from 'next/navigation';
import GeneralView from '@/components/GeneralView';
import { requireProjectUser } from '@/lib/auth';
import { getProjectState } from '@/lib/project';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function GeneralPage() {
  const user = await requireProjectUser();
  const project = await getProjectState(user.projectId);
  if (!project) redirect('/welcome');

  return <GeneralView project={project} />;
}
