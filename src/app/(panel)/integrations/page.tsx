import IntegrationsView from '@/components/IntegrationsView';
import { requireProjectManager } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  // Группа «Управление» — только владелец и второй владелец.
  await requireProjectManager();

  return <IntegrationsView />;
}
