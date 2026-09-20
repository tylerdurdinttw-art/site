import SettingsView from '@/components/SettingsView';
import { requireProjectManager } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  // Группа «Управление» — только владелец и второй владелец.
  await requireProjectManager();

  return <SettingsView />;
}
