'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PageTopBar from '@/components/PageTopBar';
import ChecksList from '@/components/ChecksList';
import type { CheckHistoryFilter, CheckHistoryItem } from '@/lib/checksShared';

export default function ChecksPage() {
  const [checks, setChecks] = useState<CheckHistoryItem[]>([]);
  const [filter, setFilter] = useState<CheckHistoryFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Медленный ответ не должен перетереть более свежий.
  const requestId = useRef(0);

  const load = useCallback(async (current: CheckHistoryFilter) => {
    const id = ++requestId.current;
    try {
      const res = await fetch(`/api/checks/history?filter=${current}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`checks: ${res.status}`);
      const body = (await res.json()) as { checks: CheckHistoryItem[] };
      if (id === requestId.current) {
        setChecks(body.checks);
        setError(null);
      }
    } catch (err) {
      console.error(err);
      if (id === requestId.current) setError('Не удалось загрузить список проверок.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(filter);
    setRefreshing(false);
  }, [filter, load]);

  return (
    <>
      <PageTopBar title="Проверки" />

      <div className="space-y-5 px-6 py-6">
        {error && (
          <div
            className="rounded-control px-4 py-3 text-[13px]"
            style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }}
          >
            {error}
          </div>
        )}

        <ChecksList
          checks={checks}
          filter={filter}
          loading={loading}
          refreshing={refreshing}
          onFilterChange={(next) => {
            setLoading(true);
            setFilter(next);
          }}
          onRefresh={refresh}
        />
      </div>
    </>
  );
}
