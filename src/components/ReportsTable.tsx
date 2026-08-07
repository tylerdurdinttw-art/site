'use client';

import { ShieldCheck, ShieldOff } from 'lucide-react';
import Avatar from '@/components/Avatar';
import type { ReportedPlayer } from '@/lib/reportsShared';
import type { PlayerStatus } from '@/lib/types';

interface Props {
  players: ReportedPlayer[];
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

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return DASH;

  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} ч назад`;

  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

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

/** Список игроков, на которых жаловались: одна строка — один игрок, а не одна жалоба. */
export default function ReportsTable({ players, loading, onSelect }: Props) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[980px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border text-text-muted">
            <th className="px-6 py-3 text-left font-normal">Игрок</th>
            <th className="px-6 py-3 text-left font-normal">Репортов</th>
            <th className="px-6 py-3 text-left font-normal">Последняя причина</th>
            <th className="px-6 py-3 text-left font-normal">Пожаловался</th>
            <th className="px-6 py-3 text-left font-normal">Когда</th>
            <th className="px-6 py-3 text-right font-normal">Сервер</th>
          </tr>
        </thead>

        <tbody>
          {loading && <SkeletonRows />}

          {!loading && players.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-24">
                <div className="flex flex-col items-center gap-2.5 text-center">
                  <ShieldCheck size={30} className="text-text-dim" />
                  <div className="text-[14px] font-medium">Репортов нет</div>
                  <div className="text-[12px] text-text-muted">
                    Жалобы игроков придут сюда от плагина — F7 или командой /report.
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
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-semibold">{p.name}</span>
                        {p.checkActive && (
                          <span
                            className="shrink-0 rounded-badge px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ backgroundColor: 'rgba(59,130,246,0.18)', color: '#7dabf8' }}
                          >
                            На проверке
                          </span>
                        )}
                        {p.bannedNow && (
                          <span
                            className="inline-flex shrink-0 items-center gap-1 rounded-badge px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ backgroundColor: 'rgba(239,68,68,0.16)', color: '#ef4444' }}
                          >
                            <ShieldOff size={10} />
                            Забанен
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-text-muted">{STATUS_LABEL[p.status]}</div>
                    </div>
                  </div>
                </td>

                <td className="px-6 py-3">
                  <span
                    className="inline-flex min-w-[26px] justify-center rounded-badge px-2 py-0.5 text-[12px] font-semibold"
                    style={{ backgroundColor: 'rgba(239,68,68,0.14)', color: 'var(--danger)' }}
                  >
                    {p.reportsCount}
                  </span>
                </td>

                <td className="px-6 py-3">
                  <span className={p.lastReason ? '' : 'text-text-muted'}>
                    {p.lastReason ?? 'Без причины'}
                  </span>
                </td>

                <td className="px-6 py-3">
                  <span className={p.lastReporterName ? '' : 'text-text-muted'}>
                    {p.lastReporterName ?? DASH}
                  </span>
                </td>

                <td className="px-6 py-3 text-text-muted">{formatWhen(p.lastReportAt)}</td>

                <td className="px-6 py-3 text-right">{p.serverName}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
