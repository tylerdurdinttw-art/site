'use client';

import { ExternalLink, UserX } from 'lucide-react';
import Avatar from '@/components/Avatar';
import type { Player, PlayerStatus } from '@/lib/types';

interface Props {
  players: Player[];
  loading: boolean;
  /** Клик по строке открывает карточку игрока. */
  onSelect: (steamId: string) => void;
}

const STATUS_LABEL: Record<PlayerStatus, string> = {
  online: 'в сети',
  sleeping: 'нет на месте',
  offline: 'не в сети',
};

const DASH = 'Неизвестно';

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-border">
          <td className="px-6 py-3.5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 animate-pulse rounded-full bg-surface-hover" />
              <div className="space-y-1.5">
                <div className="h-3 w-28 animate-pulse rounded bg-surface-hover" />
                <div className="h-2.5 w-20 animate-pulse rounded bg-surface-hover" />
              </div>
            </div>
          </td>
          {Array.from({ length: 5 }).map((__, j) => (
            <td key={j} className="px-6 py-3.5">
              <div className="h-3 w-24 animate-pulse rounded bg-surface-hover" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function PlayersTable({ players, loading, onSelect }: Props) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[980px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border text-text-muted">
            <th className="px-6 py-3 text-left font-normal">Игрок</th>
            <th className="px-6 py-3 text-left font-normal">IP адрес</th>
            <th className="px-6 py-3 text-left font-normal">Страна</th>
            <th className="px-6 py-3 text-left font-normal">Город</th>
            <th className="px-6 py-3 text-left font-normal">Провайдер</th>
            <th className="px-6 py-3 text-right font-normal">Сервер</th>
          </tr>
        </thead>

        <tbody>
          {loading && <SkeletonRows />}

          {!loading && players.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-24">
                <div className="flex flex-col items-center gap-2.5 text-center">
                  <UserX size={30} className="text-text-dim" />
                  <div className="text-[14px] font-medium">Игроки не найдены</div>
                  <div className="text-[12px] text-text-muted">
                    Проверьте подключение плагина к серверу.
                  </div>
                </div>
              </td>
            </tr>
          )}

          {!loading &&
            players.map((p) => (
              <tr
                key={p.steamId}
                onClick={() => onSelect(p.steamId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(p.steamId);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Карточка игрока ${p.name}`}
                className="cursor-pointer border-b border-border transition-colors hover:bg-surface focus:outline-none focus-visible:bg-surface"
              >
                <td className="px-6 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={p.name} avatarUrl={p.avatarUrl} status={p.status} />
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold">{p.name}</div>
                      <div className="text-[12px] text-text-muted">{STATUS_LABEL[p.status]}</div>
                    </div>
                  </div>
                </td>

                <td className="px-6 py-3">
                  {p.ip ? (
                    <span className="inline-flex items-center gap-1.5 font-mono text-[13px]">
                      {p.ip}
                      <ExternalLink size={12} className="text-text-dim" />
                    </span>
                  ) : (
                    <span className="text-text-muted">{DASH}</span>
                  )}
                </td>

                <td className="px-6 py-3">
                  <span className={p.country ? '' : 'text-text-muted'}>{p.country ?? DASH}</span>
                </td>

                <td className="px-6 py-3">
                  <span className={p.city ? '' : 'text-text-muted'}>{p.city ?? DASH}</span>
                </td>

                <td className="px-6 py-3">
                  <span className={p.isp ? '' : 'text-text-muted'}>{p.isp ?? DASH}</span>
                </td>

                <td className="px-6 py-3 text-right">{p.serverName}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
