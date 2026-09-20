import { redirect } from 'next/navigation';
import { requireProjectManager } from '@/lib/auth';
import { getProjectState } from '@/lib/project';
import { isOwner, staffOfUser } from '@/lib/projectShared';
import { isDeveloper } from '@/lib/devShared';
import StaffView from '@/components/StaffView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const user = await requireProjectManager();
  const project = await getProjectState(user.projectId);
  if (!project) redirect('/welcome');

  // Назначить второго владельца может только создатель проекта: иначе роль
  // расходилась бы дальше по цепочке без его ведома.
  const viewer = staffOfUser(project.staff, user.id);
  const canAssignCoOwner = isDeveloper(user.login) || Boolean(viewer && isOwner(viewer));

  return <StaffView initialStaff={project.staff} canAssignCoOwner={canAssignCoOwner} />;
}
