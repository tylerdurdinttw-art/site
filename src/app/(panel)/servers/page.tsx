import { redirect } from 'next/navigation';
import { requireProjectUser } from '@/lib/auth';
import { getProjectState } from '@/lib/project';
import { listServers } from '@/lib/overview';
import ServersView from '@/components/ServersView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ServersPage() {
  const user = await requireProjectUser();
  const project = await getProjectState(user.projectId);
  if (!project) redirect('/welcome');

  const servers = await listServers(user.projectId);

  return <ServersView project={project} initialServers={servers} />;
}
