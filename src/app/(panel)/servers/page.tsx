import { redirect } from 'next/navigation';
import { getProjectState } from '@/lib/project';
import { listServers } from '@/lib/overview';
import ServersView from '@/components/ServersView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ServersPage() {
  const project = await getProjectState();
  if (!project) redirect('/welcome');

  const servers = await listServers();

  return <ServersView project={project} initialServers={servers} />;
}
