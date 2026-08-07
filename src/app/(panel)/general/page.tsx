import { redirect } from 'next/navigation';
import GeneralView from '@/components/GeneralView';
import { getProjectState } from '@/lib/project';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function GeneralPage() {
  const project = await getProjectState();
  if (!project) redirect('/welcome');

  return <GeneralView project={project} />;
}
