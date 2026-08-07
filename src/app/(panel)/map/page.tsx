import PageTopBar from '@/components/PageTopBar';
import ServerMap from '@/components/ServerMap';
import { APP_NAME } from '@/lib/brand';

export const metadata = {
  title: `${APP_NAME} — Карта`,
};

export default function MapPage() {
  return (
    <>
      <PageTopBar title="Карта" />
      <div className="px-6 py-6">
        <ServerMap />
      </div>
    </>
  );
}
