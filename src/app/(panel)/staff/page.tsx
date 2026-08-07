import { redirect } from 'next/navigation';
import { getProjectState } from '@/lib/project';
import StaffView from '@/components/StaffView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const project = await getProjectState();
  if (!project) redirect('/welcome');

  return <StaffView initialStaff={project.staff} />;
}
