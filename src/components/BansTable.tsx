'use client';

import { useState } from 'react';
import { Ban, Info, LockOpen, X } from 'lucide-react';
import type { BanRow } from '@/lib/bansShared';

interface Props {
  bans: BanRow[];
  title: string;
  subtitle: string;
  loading: boolean;
  unbanningId: string | null;
  onUnban: (id: string) => void;
}

const DASH = '—';

function formatStamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-t border-border">
          {Array.from({ length: 7 }).map((__, j) => (
            <td key={j} className="px-5 py-4">
              <div className="h-3 w-full max-w-[130px] animate-pulse rounded bg-surface-hover" />
              {j === 0 && (
                <div className="mt-2 h-2.5 w-2/3 max-w-[100px] animate-pulse rounded bg-surface-hover" />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function DetailsDialog({ ban, onClose }: { ban: BanRow; onClose: () => void }) {
  const rows: [string, string][] = [
    ['Игрок', ban.name],
    ['Steam ID', ban.steamId],
    ['Причина', ban.reason],
    ['Админ', ban.admin ?? 'Неизвестно — бан выдан на сервере'],
    ['Сервер', ban.serverName],
    ['IP на момент бана', ban.ip ?? DASH],
    ['Выдан', formatStamp(ban.createdAt)],
    ['Снят', ban.unbannedAt ? formatStamp(ban.unbannedAt) : DASH],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(4,4,8,0.72)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card w-full max-w-[520px] p-5"
        role="dialog"
        aria-modal="true"
        aria-label={`Бан игрока ${ban.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(239,68,68,0.15)]">
              <Ban size={17} style={{ color: 'var(--danger)' }} />
            </div>
            <div>
              <div className="text-[15px] font-semibold leading-tight">Информация о бане</div>
              <div className="text-[12px] text-text-muted">{ban.name}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-8 w-8 items-center justify-center rounded-control transition-colors"
            style={{ backgroundColor: 'rgba(239,68,68,0.14)', color: 'var(--danger)' }}
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-2">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-start justify-between gap-4 rounded-control border border-border bg-[rgba(255,255,255,0.02)] px-3 py-2"
            >
              <span className="shrink-0 text-[12px] text-text-muted">{label}</span>
              <span
                className={`min-w-0 break-words text-right text-[13px] ${
                  label === 'Steam ID' || label === 'IP на момент бана' ? 'font-mono' : ''
                }`}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BansTable({
  bans,
  title,
  subtitle,
  loading,
  unbanningId,
  onUnban,
}: Props) {
  const [details, setDetails] = useState<BanRow | null>(null);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(239,68,68,0.15)]">
          <Ban size={17} style={{ color: 'var(--danger)' }} />
        </div>
        <div>
          <div className="text-[15px] font-semibold leading-tight">{title}</div>
          <div className="text-[12px] text-text-muted">{subtitle}</div>
          <span
            className="mt-1.5 inline-flex items-center rounded-badge px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: 'rgba(59,130,246,0.18)', color: 'var(--accent)' }}
          >
            {bans.length} банов
          </span>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[980px] border-collapse text-[13px]">
          <thead>
            <tr className="border-t border-border">
              {['Игрок', 'Причина', 'Админ', 'Сервер', 'Дата', 'Статус', 'Действия'].map((h) => (
                <th
                  key={h}
                  className="label-caps px-5 py-3 text-left font-medium text-text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading && <SkeletonRows />}

            {!loading && bans.length === 0 && (
              <tr className="border-t border-border">
                <td colSpan={7} className="px-5 py-16">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <Ban size={34} className="text-text-muted" />
                    <div className="text-[14px] font-medium">Банов не найдено</div>
                    <div className="text-[12px] text-text-muted">
                      Либо никого не банили, либо ничего не подходит под фильтры.
                    </div>
                  </div>
                </td>
              </tr>
            )}

            {!loading &&
              bans.map((ban) => {
                const active = ban.status === 'active';
                return (
                  <tr key={ban.id} className="border-t border-border transition-colors hover:bg-surface-hover">
                    <td className="px-5 py-3.5">
                      <div className="text-[14px] font-medium">{ban.name}</div>
                      <div className="font-mono text-[11px] text-text-muted">{ban.steamId}</div>
                    </td>

                    <td className="max-w-[240px] px-5 py-3.5">
                      <div className="truncate" title={ban.reason}>
                        {ban.reason}
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      {ban.admin ?? <span className="text-text-muted">{DASH}</span>}
                    </td>

                    <td className="px-5 py-3.5">{ban.serverName}</td>

                    <td className="px-5 py-3.5 font-mono text-[12px]">
                      {formatStamp(ban.createdAt)}
                    </td>

                    <td className="px-5 py-3.5">
                      <span
                        className="inline-flex items-center rounded-badge px-2 py-1 text-[11px] font-medium"
                        style={
                          active
                            ? { backgroundColor: 'rgba(239,68,68,0.16)', color: 'var(--danger)' }
                            : {
                                backgroundColor: 'rgba(138,138,158,0.14)',
                                color: 'var(--text-muted)',
                              }
                        }
                      >
                        {active ? 'Активен' : 'Снят'}
                      </span>
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDetails(ban)}
                          aria-label={`Информация о бане ${ban.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-control transition-colors"
                          style={{ backgroundColor: 'rgba(59,130,246,0.16)', color: '#60a5fa' }}
                        >
                          <Info size={15} />
                        </button>

                        {active && (
                          <button
                            type="button"
                            disabled={unbanningId === ban.id}
                            onClick={() => onUnban(ban.id)}
                            className="inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-[12px] font-medium text-white transition-colors disabled:opacity-50"
                            style={{ backgroundColor: 'var(--success)' }}
                          >
                            <LockOpen size={13} />
                            {unbanningId === ban.id ? 'Снимаем…' : 'Unban'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {details && <DetailsDialog ban={details} onClose={() => setDetails(null)} />}
    </div>
  );
}
