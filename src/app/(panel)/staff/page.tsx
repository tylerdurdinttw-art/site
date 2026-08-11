import { redirect } from 'next/navigation';
import { requireProjectUser } from '@/lib/auth';
import { getProjectState } from '@/lib/project';
import StaffView from '@/components/StaffView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const user = await requireProjectUser();
  const project = await getProjectState(user.projectId);
  if (!project) redirect('/welcome');

  return <StaffView initialStaff={project.staff} />;
}
