import { redirect } from 'next/navigation';
import { getProjectState } from '@/lib/project';
import GettingStarted from '@/components/GettingStarted';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function StartPage() {
  const project = await getProjectState();
  if (!project) redirect('/welcome');

  return <GettingStarted initial={project} />;
}
