import { redirect } from 'next/navigation';
import { requireProjectUser } from '@/lib/auth';
import { getProjectState } from '@/lib/project';
import RenewView from '@/components/RenewView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function RenewPage() {
  const user = await requireProjectUser();
  const project = await getProjectState(user.projectId);
  if (!project) redirect('/welcome');

  return <RenewView project={project} />;
}
