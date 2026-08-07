'use client';

import { useEffect, useState } from 'react';
import {
  CircleCheck,
  Clock,
  ListChecks,
  MessageSquare,
  RefreshCw,
  Search,
  Server,
  UserCog,
  X,
} from 'lucide-react';
import {
  CHECK_FILTER_OPTIONS,
  checkOutcomeBadge,
  type CheckHistoryFilter,
  type CheckHistoryItem,
  type CheckMessage,
} from '@/lib/checksShared';

interface Props {
  checks: CheckHistoryItem[];
  filter: CheckHistoryFilter;
  loading: boolean;
  refreshing: boolean;
  onFilterChange: (next: CheckHistoryFilter) => void;
  onRefresh: () => void;
}

const DASH = '—';

function formatStamp(iso: string | null): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-badge px-2.5 py-1 text-[11px] font-medium"
      style={{ backgroundColor: bg, color }}
    >
      {label}
    </span>
  );
}

function Line({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

/** Переписка проверки — открывается по клику на строку. */
function TranscriptDialog({
  check,
  onClose,
}: {
  check: CheckHistoryItem;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<CheckMessage[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/checks/${check.id}/messages`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`messages: ${res.status}`);
        const body = (await res.json()) as { messages: CheckMessage[] };
        if (!cancelled) setMessages(body.messages);
      } catch (err) {
        console.error(err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [check.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(4,4,8,0.72)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card flex max-h-[80vh] w-full max-w-[560px] flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={`Переписка проверки ${check.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight">{check.name}</div>
            <div className="mt-0.5 font-mono text-[11px] text-text-muted">{check.steamId}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control transition-colors"
            style={{ backgroundColor: 'rgba(239,68,68,0.14)', color: 'var(--danger)' }}
          >
            <X size={15} />
          </button>
        </div>

        <div className="min-h-[160px] flex-1 space-y-2 overflow-y-auto scrollbar-thin p-4">
          {failed && (
            <div className="py-10 text-center text-[13px] text-text-muted">
              Не удалось загрузить переписку.
            </div>
          )}

          {!failed && messages === null && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-plate bg-surface-hover" />
              ))}
            </div>
          )}

          {messages?.length === 0 && (
            <div className="py-10 text-center text-[13px] text-text-muted">
              За эту проверку никто ничего не написал.
            </div>
          )}

          {messages?.map((m) => {
            const fromPanel = m.from === 'panel';
            return (
              <div key={m.id} className={`flex ${fromPanel ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[85%] rounded-plate border px-3 py-2"
                  style={
                    fromPanel
                      ? {
                          backgroundColor: 'rgba(59,130,246,0.16)',
                          borderColor: 'rgba(59,130,246,0.4)',
                        }
                      : { backgroundColor: '#17171a', borderColor: 'var(--border)' }
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold">
                      {fromPanel ? 'Администрация' : check.name}
                    </span>
                    {!fromPanel && m.channel && (
                      <span className="font-mono text-[10px] text-text-muted">
                        [{m.channel.toUpperCase()}]
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-text-muted">
                      {formatTime(m.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 break-words text-[13px]">{m.text}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ChecksList({
  checks,
  filter,
  loading,
  refreshing,
  onFilterChange,
  onRefresh,
}: Props) {
  const [opened, setOpened] = useState<CheckHistoryItem | null>(null);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-plate bg-[rgba(59,130,246,0.15)]">
            <ListChecks size={18} className="text-accent" />
          </div>
          <div>
            <div className="text-[15px] font-semibold leading-tight">Список проверок</div>
            <div className="text-[12px] text-text-muted">Все проверки игроков</div>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2">
          <select
            value={filter}
            onChange={(e) => onFilterChange(e.target.value as CheckHistoryFilter)}
            aria-label="Фильтр проверок"
            className="min-w-[200px] rounded-control border border-border bg-surface-hover px-3 py-2 text-[13px] outline-none transition-colors focus:border-accent"
          >
            {CHECK_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-control px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : undefined} />
            Обновить
          </button>
        </div>
      </div>

      <div className="border-t border-border">
        {loading && (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[120px] animate-pulse rounded-plate bg-surface-hover" />
            ))}
          </div>
        )}

        {!loading && checks.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Search size={34} className="text-text-muted" />
            <div className="text-[14px] font-medium">Проверок не найдено</div>
            <div className="max-w-[420px] text-[12px] leading-relaxed text-text-muted">
              Проверка заводится кнопкой «Проверка» в карточке игрока — после этого она
              появится здесь вместе с перепиской и исходом.
            </div>
          </div>
        )}

        {!loading &&
          checks.map((check) => {
            const badge = checkOutcomeBadge(check.outcome);
            const hasDiscord = Boolean(check.discord);

            return (
              <button
                key={check.id}
                type="button"
                onClick={() => setOpened(check)}
                aria-label={`Проверка игрока ${check.name}`}
                className="flex w-full items-start justify-between gap-4 border-b border-border p-5 text-left transition-colors last:border-b-0 hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="truncate text-[14px] font-semibold">{check.name}</div>

                  <Line icon={<UserCog size={13} />}>Модератор: {check.admin ?? DASH}</Line>
                  <Line icon={<Server size={13} />}>Сервер: {check.serverName}</Line>
                  <Line icon={<Clock size={13} />}>Начало: {formatStamp(check.startedAt)}</Line>
                  <Line icon={<CircleCheck size={13} />}>
                    Завершение: {formatStamp(check.finishedAt)}
                  </Line>

                  <div className="flex flex-wrap items-center gap-2 pt-1.5">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-badge px-2.5 py-1 text-[11px] font-medium"
                      style={
                        hasDiscord
                          ? { backgroundColor: 'rgba(34,197,94,0.16)', color: '#22c55e' }
                          : { backgroundColor: 'rgba(239,68,68,0.16)', color: '#ef4444' }
                      }
                    >
                      Discord: {check.discord ?? 'Не указан'}
                    </span>

                    {check.messagesCount > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
                        <MessageSquare size={12} />
                        {check.messagesCount}
                      </span>
                    )}

                    {check.reason && (
                      <span className="min-w-0 truncate text-[11px] text-text-muted">
                        · {check.reason}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span title="Исход проверки">
                    <Badge label={badge.label} bg={badge.bg} color={badge.color} />
                  </span>
                  <span title="Действует ли бан на игрока сейчас">
                    {check.bannedNow ? (
                      <Badge label="Забанен" bg="rgba(239,68,68,0.16)" color="#ef4444" />
                    ) : (
                      <Badge label="Чист" bg="rgba(34,197,94,0.16)" color="#22c55e" />
                    )}
                  </span>
                </div>
              </button>
            );
          })}
      </div>

      {opened && <TranscriptDialog check={opened} onClose={() => setOpened(null)} />}
    </div>
  );
}
