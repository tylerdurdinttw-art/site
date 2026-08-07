'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, History, ShieldAlert } from 'lucide-react';
import PageTopBar from '@/components/PageTopBar';
import BanFilters from '@/components/BanFilters';
import BanBulkActions from '@/components/BanBulkActions';
import BansTable from '@/components/BansTable';
import {
  EMPTY_BAN_FILTERS,
  type BanFilters as Filters,
  type BansResponse,
} from '@/lib/bansShared';

type Tab = 'active' | 'history';

/** Поиск не дёргает сервер на каждый символ. */
const SEARCH_DEBOUNCE_MS = 300;

function StatCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  hint,
}: {
  icon: typeof Ban;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number | null;
  hint: string;
}) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-plate"
        style={{ backgroundColor: iconBg }}
      >
        <Icon size={19} style={{ color: iconColor }} />
      </div>
      <div className="min-w-0">
        <div className="text-[12px] text-text-muted">{label}</div>
        <div className="text-[26px] font-semibold leading-tight">
          {value === null ? <span className="text-text-muted">…</span> : value}
        </div>
        <div className="text-[11px] text-text-muted">{hint}</div>
      </div>
    </div>
  );
}

export default function BansPage() {
  const [tab, setTab] = useState<Tab>('active');
  const [filters, setFilters] = useState<Filters>(EMPTY_BAN_FILTERS);
  const [data, setData] = useState<BansResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unbanningId, setUnbanningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Гонка ответов: медленный запрос не должен перетереть свежий.
  const requestId = useRef(0);

  const load = useCallback(async (current: Filters) => {
    const id = ++requestId.current;
    try {
      const params = new URLSearchParams({
        name: current.name,
        steamId: current.steamId,
        reason: current.reason,
        serverId: current.serverId,
        status: current.status,
      });
      const res = await fetch(`/api/bans?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`bans: ${res.status}`);
      const body = (await res.json()) as BansResponse;
      if (id === requestId.current) setData(body);
    } catch (err) {
      console.error(err);
      if (id === requestId.current) setError('Не удалось загрузить баны.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(filters), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters, load]);

  // Вкладка — это шорткат для фильтра по статусу, чтобы таблица и селект не расходились.
  const switchTab = (next: Tab) => {
    setTab(next);
    setLoading(true);
    setFilters((f) => ({ ...f, status: next === 'active' ? 'active' : 'all' }));
  };

  const act = useCallback(
    async (run: () => Promise<Response>, fallback: string) => {
      setError(null);
      try {
        const res = await run();
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(body.error ?? fallback);
          return;
        }
        await load(filters);
      } catch (err) {
        console.error(err);
        setError(fallback);
      }
    },
    [filters, load],
  );

  const unban = useCallback(
    async (id: string) => {
      setUnbanningId(id);
      await act(
        () => fetch(`/api/bans/${id}/unban`, { method: 'POST' }),
        'Не удалось снять бан.',
      );
      setUnbanningId(null);
    },
    [act],
  );

  const unbanAll = useCallback(async () => {
    setBusy(true);
    await act(
      () => fetch('/api/bans/unban-all', { method: 'POST' }),
      'Не удалось разбанить всех.',
    );
    setBusy(false);
  }, [act]);

  const clearHistory = useCallback(async () => {
    setBusy(true);
    await act(
      () => fetch('/api/bans/history', { method: 'DELETE' }),
      'Не удалось очистить историю.',
    );
    setBusy(false);
  }, [act]);

  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-control px-4 py-2.5 text-[13px] font-medium transition-colors ${
      active ? 'text-white' : 'border border-border text-text-muted hover:bg-surface-hover'
    }`;

  return (
    <>
      <PageTopBar title="Блокировки" />

      <div className="space-y-5 px-6 py-6">
      <div className="grid gap-5 md:grid-cols-2">
        <StatCard
          icon={Ban}
          iconBg="rgba(59,130,246,0.15)"
          iconColor="var(--accent)"
          label="Всего банов"
          value={data?.total ?? null}
          hint="Всего банов в системе"
        />
        <StatCard
          icon={ShieldAlert}
          iconBg="rgba(239,68,68,0.15)"
          iconColor="var(--danger)"
          label="Активные баны"
          value={data?.active ?? null}
          hint="Сейчас действуют"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => switchTab('active')}
          className={tabClass(tab === 'active')}
          style={tab === 'active' ? { backgroundColor: 'var(--accent)' } : undefined}
        >
          <ShieldAlert size={15} />
          Активные баны
        </button>
        <button
          type="button"
          onClick={() => switchTab('history')}
          className={tabClass(tab === 'history')}
          style={tab === 'history' ? { backgroundColor: 'var(--accent)' } : undefined}
        >
          <History size={15} />
          История банов
        </button>
      </div>

      <BanFilters
        filters={filters}
        servers={data?.servers ?? []}
        onChange={setFilters}
        onClear={() =>
          setFilters({ ...EMPTY_BAN_FILTERS, status: tab === 'active' ? 'active' : 'all' })
        }
      />

      <BanBulkActions
        activeCount={data?.active ?? 0}
        totalCount={data?.total ?? 0}
        busy={busy}
        onUnbanAll={unbanAll}
        onClearHistory={clearHistory}
      />

      {error && (
        <div
          className="rounded-control px-4 py-3 text-[13px]"
          style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }}
        >
          {error}
        </div>
      )}

      <BansTable
        bans={data?.bans ?? []}
        title={tab === 'active' ? 'Активные баны' : 'История банов'}
        subtitle={
          tab === 'active' ? 'Список действующих банов' : 'Все баны: действующие и снятые'
        }
        loading={loading}
        unbanningId={unbanningId}
        onUnban={unban}
      />
      </div>
    </>
  );
}
