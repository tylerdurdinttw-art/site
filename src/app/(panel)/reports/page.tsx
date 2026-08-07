'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageTopBar, { FilterGroup } from '@/components/PageTopBar';
import ReportsTable from '@/components/ReportsTable';
import PlayerModal from '@/components/PlayerModal';
import Toasts from '@/components/Toasts';
import type { ReportedPlayer } from '@/lib/reportsShared';

const REFRESH_MS = 15_000;

type StateFilter = 'all' | 'check' | 'banned' | 'untouched';

const STATE_OPTIONS: { value: StateFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'check', label: 'На проверке' },
  { value: 'banned', label: 'Забаненные' },
  { value: 'untouched', label: 'Без разбора' },
];

/** Раздел «Репорты» повторяет «Игроков»: тот же список, но только с жалобами. */
export default function ReportsPage() {
  const [players, setPlayers] = useState<ReportedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<StateFilter>('all');
  const [server, setServer] = useState<string>('all');

  const fetchReports = useCallback(async () => {
    const res = await fetch('/api/reports', { cache: 'no-store' });
    if (!res.ok) throw new Error(`reports: ${res.status}`);
    const data = (await res.json()) as { players: ReportedPlayer[] };
    setPlayers(data.players);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await fetchReports();
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();

    const timer = setInterval(
      () => void fetchReports().catch((err) => console.error(err)),
      REFRESH_MS,
    );
    return () => clearInterval(timer);
  }, [fetchReports]);

  // Поиск по нику, SteamID и причине — тому, что видно в строке.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      if (state === 'check' && !p.checkActive) return false;
      if (state === 'banned' && !p.bannedNow) return false;
      if (state === 'untouched' && (p.checkActive || p.bannedNow)) return false;
      if (server !== 'all' && p.serverName !== server) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.steamId.includes(q) ||
        (p.lastReason ?? '').toLowerCase().includes(q) ||
        (p.lastReporterName ?? '').toLowerCase().includes(q)
      );
    });
  }, [players, query, state, server]);

  const serverOptions = useMemo(() => {
    const names = Array.from(new Set(players.map((p) => p.serverName))).sort();
    return [{ value: 'all', label: 'Все серверы' }, ...names.map((n) => ({ value: n, label: n }))];
  }, [players]);

  return (
    <>
      <PageTopBar
        title="Репорты"
        search={query}
        onSearch={setQuery}
        filtersActive={state !== 'all' || server !== 'all'}
        filters={
          <>
            <FilterGroup label="Состояние" value={state} options={STATE_OPTIONS} onChange={setState} />
            <FilterGroup label="Сервер" value={server} options={serverOptions} onChange={setServer} />
          </>
        }
      />
      <ReportsTable players={visible} loading={loading} onSelect={setSelected} />
      {selected && <PlayerModal steamId={selected} onClose={() => setSelected(null)} />}
      <Toasts />
    </>
  );
}
