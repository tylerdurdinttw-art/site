'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Copy, Send, UserRound } from 'lucide-react';
import Avatar from '@/components/Avatar';
import IpLink from '@/components/IpLink';
import {
  CANCEL_REASONS,
  MAX_CHECK_MESSAGE_LENGTH,
  MAX_CHECK_REASON_LENGTH,
  PASSED_REASON,
  TEAM_BAN_REASON,
  checkOutcomeBadge,
  type CheckOutcome,
  type CheckRoomData,
} from '@/lib/checksShared';
import { DEFAULT_SETTINGS, type ModerationSettings } from '@/lib/settingsShared';
import type { PlayerDetails, PlayerStatus, TeamMode } from '@/lib/types';

/** Страховка на случай, когда SSE недоступен. */
const POLL_MS = 3000;
/** Карточка игрока справа меняется медленно — обновляем её реже переписки. */
const PLAYER_POLL_MS = 15_000;
const SSE_DEBOUNCE_MS = 120;

const DASH = '—';

const MODE_LABEL: Record<TeamMode, string> = {
  solo: 'Соло',
  duo: 'Дуо',
  trio: 'Трио',
  squad: 'Сквад',
  clan: 'Клан',
};

const MODE_COLOR: Record<TeamMode, string> = {
  solo: '#eab308',
  duo: '#22c55e',
  trio: '#38bdf8',
  squad: '#a78bfa',
  clan: '#ec4899',
};

const STATUS_LABEL: Record<PlayerStatus, string> = {
  online: 'в сети',
  sleeping: 'нет на месте',
  offline: 'не в сети',
};

/* ================= форматирование ================= */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  const date = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${date} в ${time}`;
}

/** «1 минута», «2 минуты», «5 минут» — падеж выбирается по числу. */
function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = count % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return DASH;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} ${plural(minutes, 'минута', 'минуты', 'минут')}`;
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}

function formatHours(minutes: number | null): string {
  if (minutes === null) return DASH;
  return `~${Math.round(minutes / 60).toLocaleString('ru-RU')}`;
}

function formatAgo(iso: string | null): string {
  if (!iso) return DASH;
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return DASH;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  return `${Math.round(minutes / 60)} ч назад`;
}

function visibilityLabel(visibility: number | null | undefined): string {
  if (visibility === null || visibility === undefined) return DASH;
  if (visibility >= 3) return 'Открыт';
  if (visibility === 2) return 'Открыт частично';
  return 'Закрыт';
}

/** Ник в стиле «@ynazico» — из имени, как его показывает шапка. */
function handle(name: string): string {
  return `@${name.toLowerCase().replace(/\s+/g, '')}`;
}

/* ================= правая колонка ================= */

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-control border border-border">
      <div className="flex items-center justify-between gap-3 bg-surface px-4 py-2">
        <span className="text-[13px] font-semibold">{title}</span>
        {note && <span className="text-[12px] text-text-muted">{note}</span>}
      </div>
      <div className="grid grid-cols-2">{children}</div>
    </section>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-t border-border px-4 py-2.5">
      <div className="text-[12px] text-text-muted">{label}</div>
      <div className="mt-0.5 truncate text-[13px] font-semibold">{children}</div>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-badge bg-surface px-2.5 py-1 text-[12px] font-medium">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}

function PlayerPanel({
  check,
  player,
  onCopySteamId,
  copied,
}: {
  check: CheckRoomData;
  player: PlayerDetails | null;
  onCopySteamId: () => void;
  copied: boolean;
}) {
  const steam = player?.steam;

  return (
    <aside className="hidden w-[420px] shrink-0 flex-col gap-3 overflow-y-auto scrollbar-thin border-l border-border p-4 xl:flex">
      <div className="flex items-center gap-3">
        <Avatar
          name={player?.name ?? check.name}
          avatarUrl={player?.avatarUrl}
          status={player?.status}
          size={48}
        />
        <div className="min-w-0">
          <div className="truncate text-[18px] font-semibold leading-tight">
            {player?.name ?? check.name}
          </div>
          <div className="text-[13px] text-text-muted">
            {player ? STATUS_LABEL[player.status] : 'загрузка…'}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {player && <Badge color={MODE_COLOR[player.teamMode]}>{MODE_LABEL[player.teamMode]}</Badge>}
        {player && <Badge color="#22c55e">{(player.language ?? 'n/a').toUpperCase()}</Badge>}
        {player && <Badge color="#3b82f6">{player.ping} ms</Badge>}
        <Badge color={steam?.vacBanned ? 'var(--danger)' : 'var(--text-dim)'}>VAC</Badge>
        <Badge color={check.active ? '#7dabf8' : 'var(--text-dim)'}>
          {check.active ? 'На проверке' : 'Проверка завершена'}
        </Badge>
      </div>

      <Section title="Состояние">
        <Cell label="Двигался">{formatAgo(player?.movedAt ?? null)}</Cell>
        <Cell label="Был на базе">{DASH}</Cell>
        <Cell label="Квадрат">{player?.square ?? DASH}</Cell>
        <Cell label="На сервере">{formatDuration(player?.sessionSec ?? null)}</Cell>
      </Section>

      <Section title="Статистика" note="за 7 дней">
        <Cell label="K/D">{player ? player.combat.kd.toFixed(2) : DASH}</Cell>
        <Cell label="Убийств">{player?.combat.kills ?? DASH}</Cell>
        <Cell label="В голову">{player?.combat.headshots ?? DASH}</Cell>
        <Cell label="Смертей">{player?.combat.deaths ?? DASH}</Cell>
      </Section>

      <Section title="Об игроке">
        <Cell label="Играет на">{player?.serverName ?? check.serverName}</Cell>
        <Cell label="SteamID">
          <span className="inline-flex items-center gap-1.5">
            <span className="font-mono">{check.steamId}</span>
            <button
              type="button"
              onClick={onCopySteamId}
              aria-label="Скопировать SteamID"
              className="text-text-muted transition-colors hover:text-text"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </span>
        </Cell>
        <Cell label="Впервые замечен">{formatDateTime(player?.firstSeenAt ?? null)}</Cell>
        <Cell label="IP адрес">
          <IpLink ip={player?.ip ?? ''} />
        </Cell>
        <Cell label="Страна, город">
          {[player?.country, player?.city].filter(Boolean).join(', ') || 'Unknown, Unknown'}
        </Cell>
        <Cell label="Провайдер">
          <span className={player?.isVpn ? 'text-[color:var(--danger)]' : ''}>
            {player?.isp ?? DASH}
            {player?.isVpn ? ' · VPN' : ''}
          </span>
        </Cell>
      </Section>

      <Section title="Информация из Steam">
        <Cell label="Приватность">{visibilityLabel(steam?.visibility)}</Cell>
        <Cell label="Аккаунт создан">{formatDateTime(steam?.accountCreatedAt ?? null)}</Cell>
        <Cell label="Часов в RUST">{formatHours(steam?.rustMinutes ?? null)}</Cell>
        <Cell label="Часов за 2 недели">
          {steam?.rustMinutes2Weeks === null || steam?.rustMinutes2Weeks === undefined
            ? 'Информация скрыта'
            : formatHours(steam.rustMinutes2Weeks)}
        </Cell>
        <Cell label="Gamebans / VAC">
          <span style={{ color: steam?.gameBanCount || steam?.vacBanCount ? 'var(--warning)' : undefined }}>
            {steam ? `${steam.gameBanCount} / ${steam.vacBanCount}` : DASH}
          </span>
        </Cell>
        <Cell label="Последнее обновление">{formatDateTime(player?.lastSeenAt ?? null)}</Cell>
      </Section>
    </aside>
  );
}

/* ================= завершение проверки ================= */

function FinishDialog({
  verdicts,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  verdicts: string[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (outcome: CheckOutcome, reason: string) => void;
}) {
  const [outcome, setOutcome] = useState<CheckOutcome>('passed');
  const [banReason, setBanReason] = useState(verdicts[0] ?? '');
  const [cancelReason, setCancelReason] = useState<string>(CANCEL_REASONS[0]);

  const reason =
    outcome === 'ban'
      ? banReason.trim()
      : outcome === 'team_ban'
        ? TEAM_BAN_REASON
        : outcome === 'cancelled'
          ? cancelReason.trim()
          : PASSED_REASON;

  const options: { key: CheckOutcome; label: string }[] = [
    { key: 'passed', label: 'Игрок чист' },
    { key: 'ban', label: 'Бан игрока' },
    { key: 'team_ban', label: 'Бан тимы' },
    { key: 'cancelled', label: 'Отмена' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(4,4,6,0.72)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card w-full max-w-[440px] p-5"
        role="dialog"
        aria-modal="true"
        aria-label="Итог проверки"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[15px] font-semibold">Итог проверки</div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {options.map((option) => {
            const on = option.key === outcome;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setOutcome(option.key)}
                className={`rounded-control border px-3 py-2 text-[13px] transition-colors ${
                  on
                    ? 'border-accent bg-[rgba(59,130,246,0.12)] text-white'
                    : 'border-border text-text-muted hover:bg-surface-hover'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {outcome === 'ban' && (
          <div className="mt-4">
            <div className="mb-1.5 text-[12px] text-text-muted">Вердикт</div>
            <div className="flex flex-wrap gap-1.5">
              {verdicts.map((verdict) => (
                <button
                  key={verdict}
                  type="button"
                  onClick={() => setBanReason(verdict)}
                  className={`rounded-badge px-2.5 py-1 text-[12px] transition-colors ${
                    banReason === verdict
                      ? 'bg-[rgba(59,130,246,0.18)] text-white'
                      : 'bg-surface-hover text-text-muted hover:text-text'
                  }`}
                >
                  {verdict}
                </button>
              ))}
            </div>
            <input
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              maxLength={MAX_CHECK_REASON_LENGTH}
              placeholder="Причина бана"
              aria-label="Причина бана"
              className="mt-2 w-full rounded-control border border-border bg-surface-hover px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
          </div>
        )}

        {outcome === 'cancelled' && (
          <div className="mt-4">
            <div className="mb-1.5 text-[12px] text-text-muted">Причина отмены</div>
            <div className="flex flex-wrap gap-1.5">
              {CANCEL_REASONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCancelReason(item)}
                  className={`rounded-badge px-2.5 py-1 text-[12px] transition-colors ${
                    cancelReason === item
                      ? 'bg-[rgba(59,130,246,0.18)] text-white'
                      : 'bg-surface-hover text-text-muted hover:text-text'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              maxLength={MAX_CHECK_REASON_LENGTH}
              placeholder="Причина отмены"
              aria-label="Причина отмены"
              className="mt-2 w-full rounded-control border border-border bg-surface-hover px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
          </div>
        )}

        {outcome === 'team_ban' && (
          <p className="mt-3 text-[12px] text-text-muted">
            Вся команда игрока будет заблокирована с причиной «{TEAM_BAN_REASON}».
          </p>
        )}

        {error && (
          <div className="mt-3 text-[12px]" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost py-2">
            Назад
          </button>
          <button
            type="button"
            disabled={busy || !reason}
            onClick={() => onConfirm(outcome, reason)}
            className="rounded-control px-4 py-2 text-[13px] font-medium text-white transition-opacity disabled:opacity-50"
            style={{
              backgroundColor: outcome === 'passed' ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {busy ? 'Завершаем…' : 'Завершить проверку'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= страница проверки ================= */

/** Событие ленты: и сообщения переписки, и вехи самой проверки идут одним потоком. */
interface Entry {
  id: string;
  at: string;
  kind: 'event' | 'panel' | 'player';
  title: string;
  text?: string;
}

export default function CheckRoom({ checkId }: { checkId: string }) {
  const [check, setCheck] = useState<CheckRoomData | null>(null);
  const [player, setPlayer] = useState<PlayerDetails | null>(null);
  const [settings, setSettings] = useState<ModerationSettings>(DEFAULT_SETTINGS);
  const [notFound, setNotFound] = useState(false);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [finishOpen, setFinishOpen] = useState(false);
  const [finishBusy, setFinishBusy] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/checks/${checkId}`, { cache: 'no-store' });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error(`check: ${res.status}`);
      const body = (await res.json()) as { check: CheckRoomData };
      setCheck(body.check);
    } catch (err) {
      console.error(err);
    }
  }, [checkId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Сообщение игрока приходит событием chat_message: к кадру SSE строки уже в базе.
  useEffect(() => {
    if (typeof window === 'undefined' || !('EventSource' in window)) return;

    const source = new EventSource('/api/events/stream');
    let debounce: ReturnType<typeof setTimeout> | null = null;

    source.addEventListener('panel', (e) => {
      let type: string;
      try {
        type = (JSON.parse((e as MessageEvent).data) as { type?: string }).type ?? '';
      } catch {
        return;
      }
      if (type !== 'chat_message') return;

      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void load(), SSE_DEBOUNCE_MS);
    });

    // Поток упал — остаётся поллинг, он и так работает.
    source.onerror = () => source.close();

    return () => {
      if (debounce) clearTimeout(debounce);
      source.close();
    };
  }, [load]);

  const steamId = check?.steamId;
  useEffect(() => {
    if (!steamId) return;

    const fetchPlayer = async () => {
      try {
        const res = await fetch(`/api/players/${steamId}`, { cache: 'no-store' });
        if (!res.ok) return;
        setPlayer((await res.json()) as PlayerDetails);
      } catch (err) {
        console.error(err);
      }
    };

    void fetchPlayer();
    const timer = setInterval(() => void fetchPlayer(), PLAYER_POLL_MS);
    return () => clearInterval(timer);
  }, [steamId]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/settings', { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as { settings: ModerationSettings };
        setSettings(body.settings);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  const entries = useMemo<Entry[]>(() => {
    if (!check) return [];

    const rows: Entry[] = [
      {
        id: 'started',
        at: check.startedAt,
        kind: 'event',
        title: 'Начало проверки',
        text: `${check.admin ?? 'Сотрудник'} инициировал проверку`,
      },
    ];

    for (const message of check.messages) {
      rows.push({
        id: message.id,
        at: message.createdAt,
        kind: message.from === 'panel' ? 'panel' : 'player',
        title: message.from === 'panel' ? 'Администрация' : check.name,
        text: message.text,
      });
    }

    if (check.finishedAt) {
      const badge = checkOutcomeBadge(check.outcome);
      rows.push({
        id: 'finished',
        at: check.finishedAt,
        kind: 'event',
        title: 'Проверка завершена',
        text: check.reason ? `${badge.label} · ${check.reason}` : badge.label,
      });
    }

    return rows;
  }, [check]);

  const lastEntryId = entries.at(-1)?.id ?? null;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastEntryId]);

  const send = useCallback(async () => {
    if (!check) return;
    const text = draft.trim();
    if (!text) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/checks/${check.id}/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? 'Сообщение не отправлено.');
        return;
      }
      setDraft('');
      await load();
    } catch (err) {
      console.error(err);
      setError('Панель недоступна — сообщение не отправлено.');
    } finally {
      setSending(false);
    }
  }, [check, draft, load]);

  const toggleBanner = useCallback(async () => {
    if (!check) return;
    setError(null);
    try {
      const res = await fetch(`/api/checks/${check.id}/banner`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ show: !check.bannerVisible }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? 'Не удалось изменить табличку.');
        return;
      }
      await load();
    } catch (err) {
      console.error(err);
      setError('Панель недоступна — команда не ушла.');
    }
  }, [check, load]);

  const finish = useCallback(
    async (outcome: CheckOutcome, reason: string) => {
      if (!check) return;
      setFinishBusy(true);
      setFinishError(null);
      try {
        const res = await fetch(`/api/checks/${check.id}/finish`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ outcome, reason }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          setFinishError(body.error ?? 'Не удалось завершить проверку.');
          return;
        }
        setFinishOpen(false);
        await load();
      } catch (err) {
        console.error(err);
        setFinishError('Панель недоступна — проверка не завершена.');
      } finally {
        setFinishBusy(false);
      }
    },
    [check, load],
  );

  const copySteamId = useCallback(() => {
    if (!check) return;
    void navigator.clipboard
      .writeText(check.steamId)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => console.error(err));
  }, [check]);

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
        <div className="text-[15px] font-semibold">Проверка не найдена</div>
        <Link href="/checks" className="btn-ghost py-2">
          К списку проверок
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* ================= хлебные крошки ================= */}
      <div className="flex h-[58px] shrink-0 items-center gap-1.5 border-b border-border px-6">
        <Link href="/checks" className="text-[13px] text-text-muted transition-colors hover:text-text">
          Проверки
        </Link>
        <ChevronRight size={14} className="text-text-dim" />
        <span className="font-mono text-[13px]">#{check?.number ?? '—'}</span>

        <div className="ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-muted">
          <UserRound size={15} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ================= переписка ================= */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 px-6 py-4">
            <Avatar
              name={check?.admin ?? 'Панель'}
              status={check?.active ? 'online' : undefined}
              size={36}
            />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold leading-tight">
                {check?.admin ?? 'Панель'}
              </div>
              <div className="text-[12px] text-text-muted">{handle(check?.admin ?? 'panel')}</div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void toggleBanner()}
                disabled={!check?.active}
                className="btn-ghost py-2 disabled:opacity-45"
              >
                {check?.bannerVisible ? 'Убрать табличку' : 'Показать табличку'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFinishError(null);
                  setFinishOpen(true);
                }}
                disabled={!check?.active}
                className="btn-primary disabled:opacity-45"
              >
                Завершить
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-6 mb-2 rounded-control px-3 py-2 text-[12px]"
              style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }}
            >
              {error}
            </div>
          )}

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-6 pb-4">
            {entries.map((entry) => (
              <div key={entry.id} className="flex gap-3 py-2.5">
                <span className="w-[62px] shrink-0 pt-0.5 text-right font-mono text-[12px] text-text-dim">
                  {formatTime(entry.at)}
                </span>

                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      entry.kind === 'event'
                        ? 'var(--text-dim)'
                        : entry.kind === 'panel'
                          ? 'var(--accent)'
                          : 'var(--success)',
                  }}
                />

                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold">{entry.title}</div>
                  {entry.text && (
                    <div
                      className={`mt-0.5 break-words text-[13px] ${
                        entry.kind === 'event' ? 'text-text-muted' : ''
                      }`}
                    >
                      {entry.text}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ================= отправка ================= */}
          <div className="shrink-0 px-6 pb-6">
            <div className="flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-2.5 focus-within:border-border-strong">
              <Send size={15} className="shrink-0 text-text-dim" />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                maxLength={MAX_CHECK_MESSAGE_LENGTH}
                disabled={!check?.active || sending}
                placeholder={check?.active ? 'Введите сообщение' : 'Проверка завершена'}
                aria-label="Сообщение игроку"
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-dim disabled:cursor-not-allowed"
              />
            </div>
            <div className="mt-1.5 text-[11px] text-text-dim">
              Сообщение увидит только этот игрок.
            </div>
          </div>
        </div>

        {check && (
          <PlayerPanel
            check={check}
            player={player}
            copied={copied}
            onCopySteamId={copySteamId}
          />
        )}
      </div>

      {finishOpen && (
        <FinishDialog
          verdicts={settings.bans.checkVerdicts}
          busy={finishBusy}
          error={finishError}
          onClose={() => setFinishOpen(false)}
          onConfirm={(outcome, reason) => void finish(outcome, reason)}
        />
      )}
    </div>
  );
}
