'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PageTopBar, { FilterGroup } from '@/components/PageTopBar';
import PlayersTable from '@/components/PlayersTable';
import PlayerModal from '@/components/PlayerModal';
import Toasts from '@/components/Toasts';
import type { Player, PlayerStatus } from '@/lib/types';

const REFRESH_MS = 15_000;

type StatusFilter = PlayerStatus | 'all';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'online', label: 'В сети' },
  { value: 'sleeping', label: 'Нет на месте' },
  { value: 'offline', label: 'Не в сети' },
];

function PlayersView() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [server, setServer] = useState<string>('all');

  // Поиск в сайдбаре приводит сюда с ?player=<steamId> — сразу открываем карточку.
  const params = useSearchParams();
  const requested = params.get('player');
  useEffect(() => {
    if (requested) setSelected(requested);
  }, [requested]);

  const fetchPlayers = useCallback(async () => {
    const res = await fetch('/api/players', { cache: 'no-store' });
    if (!res.ok) throw new Error(`players: ${res.status}`);
    const data = (await res.json()) as { players: Player[] };
    setPlayers(data.players);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await fetchPlayers();
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();

    const timer = setInterval(() => void fetchPlayers().catch((err) => console.error(err)), REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchPlayers]);

  // Поиск идёт по нику, SteamID и адресу — тому, что видно в строке.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      if (status !== 'all' && p.status !== status) return false;
      if (server !== 'all' && p.serverName !== server) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.steamId.includes(q) ||
        p.ip.includes(q) ||
        (p.isp ?? '').toLowerCase().includes(q)
      );
    });
  }, [players, query, status, server]);

  const serverOptions = useMemo(() => {
    const names = Array.from(new Set(players.map((p) => p.serverName))).sort();
    return [{ value: 'all', label: 'Все серверы' }, ...names.map((n) => ({ value: n, label: n }))];
  }, [players]);

  return (
    <>
      <PageTopBar
        title="Игроки"
        search={query}
        onSearch={setQuery}
        filtersActive={status !== 'all' || server !== 'all'}
        filters={
          <>
            <FilterGroup label="Статус" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
            <FilterGroup label="Сервер" value={server} options={serverOptions} onChange={setServer} />
          </>
        }
      />
      <PlayersTable players={visible} loading={loading} onSelect={setSelected} />
      {selected && <PlayerModal steamId={selected} onClose={() => setSelected(null)} />}
      <Toasts />
    </>
  );
}

export default function PlayersPage() {
  // useSearchParams требует границы Suspense — за ней страница и живёт.
  return (
    <Suspense fallback={null}>
      <PlayersView />
    </Suspense>
  );
}
