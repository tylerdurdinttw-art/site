'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ChartColumn,
  Check,
  Copy,
  ExternalLink,
  Flag,
  Home,
  MoreVertical,
  Search,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Avatar from '@/components/Avatar';
import IpLink from '@/components/IpLink';
import { copyText } from '@/lib/clipboard';
import type { PlayerDetails, PlayerStatus, TeamMode } from '@/lib/types';

interface Props {
  steamId: string;
  onClose: () => void;
}

type TabKey = 'overview' | 'team' | 'reports' | 'stats' | 'activity';

/** По ТЗ в карточке оставлены только первые пять вкладок. */
const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'overview', label: 'Обзор', icon: Home },
  { key: 'team', label: 'Команда', icon: Users },
  { key: 'reports', label: 'Репорты', icon: Flag },
  { key: 'stats', label: 'Статистика', icon: ChartColumn },
  { key: 'activity', label: 'Лог активности', icon: Activity },
];

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

const DASH = '—';

/* ================= форматирование ================= */

function formatDateTime(iso: string | null): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  const date = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${date} в ${time}`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return DASH;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} мин`;
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

function visibilityLabel(visibility: number | null): string {
  if (visibility === null) return DASH;
  if (visibility >= 3) return 'Открыт';
  if (visibility === 2) return 'Открыт частично';
  return 'Закрыт';
}

type Steam = PlayerDetails['steam'];

function banned(steam: Steam | undefined): boolean {
  return Boolean(steam?.available && (steam.vacBanned || steam.gameBanCount > 0));
}

/**
 * «Нет» здесь — это ответ Steam, а не отсутствие данных: без ключа или при
 * ошибке запроса панель честно говорит, что не знает.
 */
function banLabel(steam: Steam | undefined): string {
  if (!steam?.available) return 'Steam не ответил';

  const parts: string[] = [];
  if (steam.vacBanned) parts.push(`VAC: ${steam.vacBanCount || 1}`);
  if (steam.gameBanCount > 0) parts.push(`EAC: ${steam.gameBanCount}`);

  return parts.length > 0 ? parts.join(' · ') : 'Нет';
}

/* ================= блоки разметки ================= */

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
      <div className="flex items-center justify-between gap-3 bg-surface-hover px-4 py-2.5">
        <span className="text-[13px] font-semibold">{title}</span>
        {note && <span className="text-[12px] text-text-muted">{note}</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4">{children}</div>
    </section>
  );
}

function Cell({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`border-t border-border px-4 py-2.5 ${wide ? 'col-span-2' : ''}`}>
      <div className="text-[12px] text-text-muted">{label}</div>
      <div className="mt-0.5 truncate text-[13px] font-semibold">{children}</div>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-badge bg-surface-hover px-2.5 py-1 text-[12px] font-medium">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-control border border-border py-14 text-center text-[13px] text-text-muted">
      {text}
    </div>
  );
}

/* ================= окно ================= */

export default function PlayerModal({ steamId, onClose }: Props) {
  const [data, setData] = useState<PlayerDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [checkOk, setCheckOk] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/players/${steamId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`player: ${res.status}`);
        const details = (await res.json()) as PlayerDetails;
        if (!cancelled) setData(details);
      } catch (err) {
        console.error(err);
        if (!cancelled) setLoadError('Не удалось загрузить карточку игрока.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [steamId]);

  // Escape закрывает окно, фон под ним не скроллится.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  // Клик мимо меню его закрывает.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const copySteamId = useCallback(async () => {
    if (!(await copyText(steamId))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [steamId]);

  // Проверка идёт на своей странице: сразу уводим туда — и новую, и уже начатую.
  const requestCheck = useCallback(async () => {
    setMenuOpen(false);
    setCheckMessage(null);

    try {
      const res = await fetch(`/api/players/${steamId}/check`, { method: 'POST' });
      const body = (await res.json()) as {
        error?: string;
        message?: string;
        checkId?: string;
        alreadyRunning?: boolean;
      };

      if (!res.ok || !body.checkId) {
        setCheckOk(false);
        setCheckMessage(body.error ?? 'Не удалось вызвать игрока на проверку.');
        return;
      }

      setCheckOk(true);
      setCheckMessage(
        body.alreadyRunning ? (body.message ?? 'Проверка уже идёт.') : 'Проверка начата.',
      );
      router.push(`/checks/${body.checkId}`);
    } catch (err) {
      console.error(err);
      setCheckOk(false);
      setCheckMessage('Панель не смогла поставить команду в очередь.');
    }
  }, [router, steamId]);

  const steam = data?.steam;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(4,4,6,0.72)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card flex h-[620px] max-h-[92vh] w-full max-w-[860px] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={data ? `Игрок ${data.name}` : 'Карточка игрока'}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================= левая колонка ================= */}
        <div className="flex w-[248px] shrink-0 flex-col border-r border-border p-4">
          <div className="flex items-center gap-3">
            <Avatar
              name={data?.name ?? '?'}
              avatarUrl={data?.avatarUrl}
              status={data?.status}
              size={44}
            />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold leading-tight">
                {data?.name ?? (loadError ? 'Не найден' : 'Загрузка…')}
              </div>
              <div className="text-[12px] text-text-muted">
                {data ? STATUS_LABEL[data.status] : DASH}
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <a
              href={`https://steamcommunity.com/profiles/${steamId}`}
              target="_blank"
              rel="noreferrer noopener"
              className="btn-ghost flex-1 py-2"
              title="Профиль в Steam"
            >
              <ExternalLink size={15} />
            </a>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Действия"
                aria-expanded={menuOpen}
                className="btn-ghost w-[52px] py-2"
              >
                <MoreVertical size={15} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-[calc(100%+4px)] z-10 w-[190px] overflow-hidden rounded-control border border-border bg-surface-raised py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => void requestCheck()}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-hover"
                  >
                    <Search size={14} className="text-text-muted" />
                    Вызвать на проверку
                  </button>
                  <button
                    type="button"
                    onClick={() => void copySteamId()}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-hover"
                  >
                    <Copy size={14} className="text-text-muted" />
                    Скопировать SteamID
                  </button>
                </div>
              )}
            </div>
          </div>

          <nav className="mt-4 space-y-0.5">
            {TABS.map(({ key, label, icon: Icon }) => {
              const active = key === tab;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-control px-3 py-2 text-left text-[13px] transition-colors ${
                    active
                      ? 'bg-surface-hover font-medium text-white'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text'
                  }`}
                >
                  <Icon size={15} className="shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* ================= правая колонка ================= */}
        <div className="relative min-w-0 flex-1 overflow-y-auto scrollbar-thin p-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            <X size={15} />
          </button>

          {loadError && <Empty text={loadError} />}

          {!loadError && !data && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-control bg-surface-hover" />
              ))}
            </div>
          )}

          {data && (
            <>
              <div className="flex flex-wrap items-center gap-2 pr-10">
                <Badge color={MODE_COLOR[data.teamMode]}>{MODE_LABEL[data.teamMode]}</Badge>
                <Badge color="#22c55e">{(data.language ?? 'n/a').toUpperCase()}</Badge>
                <Badge color="#3b82f6">{data.ping} ms</Badge>

                {/*
                  Значки блокировок вешаются только на тех, у кого они есть.
                  Постоянный серый «VAC» на каждом игроке ничего не сообщал: по нему
                  нельзя было отличить чистый аккаунт от того, о котором Steam молчит.
                */}
                {steam?.available && steam.vacBanned && (
                  <Badge color="var(--danger)">
                    VAC{steam.vacBanCount > 1 ? ` ×${steam.vacBanCount}` : ''}
                  </Badge>
                )}
                {steam?.available && steam.gameBanCount > 0 && (
                  <Badge color="var(--danger)">
                    EAC{steam.gameBanCount > 1 ? ` ×${steam.gameBanCount}` : ''}
                  </Badge>
                )}
              </div>

              {checkMessage && (
                <div
                  className="mt-3 rounded-control px-3 py-2 text-[12px]"
                  style={
                    checkOk
                      ? { backgroundColor: 'rgba(34,197,94,0.12)', color: 'var(--success)' }
                      : { backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }
                  }
                >
                  {checkMessage}
                </div>
              )}

              <div className="mt-4 space-y-3">
                {tab === 'overview' && (
                  <>
                    <Section title="Состояние">
                      <Cell label="Двигался">{formatAgo(data.movedAt)}</Cell>
                      <Cell label="Был на базе">{DASH}</Cell>
                      <Cell label="Квадрат">{data.square ?? DASH}</Cell>
                      <Cell label="На сервере">{formatDuration(data.sessionSec)}</Cell>
                    </Section>

                    <Section title="Статистика" note="за 7 дней">
                      <Cell label="K/D">{data.combat.kd.toFixed(2)}</Cell>
                      <Cell label="Убийств">{data.combat.kills}</Cell>
                      <Cell label="В голову">{data.combat.headshots}</Cell>
                      <Cell label="Смертей">{data.combat.deaths}</Cell>
                    </Section>

                    <Section title="Об игроке">
                      <Cell label="Играет на" wide>
                        {data.serverName}
                      </Cell>
                      <Cell label="SteamID" wide>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-mono">{data.steamId}</span>
                          <button
                            type="button"
                            onClick={() => void copySteamId()}
                            aria-label="Скопировать SteamID"
                            className="text-text-muted transition-colors hover:text-text"
                          >
                            {copied ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                        </span>
                      </Cell>
                      <Cell label="Впервые замечен" wide>
                        {formatDateTime(data.firstSeenAt)}
                      </Cell>
                      <Cell label="IP адрес" wide>
                        <IpLink ip={data.ip} />
                      </Cell>
                      <Cell label="Страна, город" wide>
                        {[data.country, data.city].filter(Boolean).join(', ') || 'Unknown, Unknown'}
                      </Cell>
                      <Cell label="Провайдер" wide>
                        <span className={data.isVpn ? 'text-[color:var(--danger)]' : ''}>
                          {data.isp ?? DASH}
                          {data.isVpn ? ' · VPN' : ''}
                        </span>
                      </Cell>
                    </Section>

                    <Section title="Информация из Steam">
                      <Cell label="Приватность" wide>
                        {visibilityLabel(steam?.visibility ?? null)}
                      </Cell>
                      <Cell label="Аккаунт создан" wide>
                        {formatDateTime(steam?.accountCreatedAt ?? null)}
                      </Cell>
                      <Cell label="Часов в RUST" wide>
                        {formatHours(steam?.rustMinutes ?? null)}
                      </Cell>
                      <Cell label="Часов за 2 недели" wide>
                        {steam?.rustMinutes2Weeks === null || steam?.rustMinutes2Weeks === undefined
                          ? 'Информация скрыта'
                          : formatHours(steam.rustMinutes2Weeks)}
                      </Cell>
                      <Cell label="Блокировки" wide>
                        <span
                          className={banned(steam) ? 'text-[color:var(--danger)]' : undefined}
                        >
                          {banLabel(steam)}
                        </span>
                      </Cell>
                      <Cell label="С последнего бана" wide>
                        {steam?.available && banned(steam) && steam.daysSinceLastBan !== null
                          ? `${steam.daysSinceLastBan} дн.`
                          : DASH}
                      </Cell>
                    </Section>

                    {steam && !steam.available && (
                      <p className="text-[12px] leading-relaxed text-text-muted">
                        Данные Steam недоступны: {steam.error}. Часы и блокировки читаются через
                        Steam Web API — нужен ключ: его задают в разделе «Разработка» либо в{' '}
                        <span className="font-mono">STEAM_API_KEY</span>.
                      </p>
                    )}
                  </>
                )}

                {tab === 'team' &&
                  (data.team.length === 0 ? (
                    <Empty text="Игрок не состоит в команде" />
                  ) : (
                    <div className="divide-y divide-border overflow-hidden rounded-control border border-border">
                      {data.team.map((mate) => (
                        <div key={mate.steamId} className="flex items-center gap-3 px-4 py-2.5">
                          <Avatar
                            name={mate.name}
                            avatarUrl={mate.avatarUrl}
                            status={mate.status}
                            size={30}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-medium">{mate.name}</div>
                            <div className="font-mono text-[11px] text-text-muted">
                              {mate.steamId}
                            </div>
                          </div>
                          <span className="text-[12px] text-text-muted">
                            {STATUS_LABEL[mate.status]}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}

                {tab === 'reports' &&
                  (data.reports.length === 0 ? (
                    <Empty text="На игрока не жаловались" />
                  ) : (
                    <div className="divide-y divide-border overflow-hidden rounded-control border border-border">
                      {data.reports.map((report) => (
                        <div key={report.id} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-[13px] font-medium">
                              {report.reporterName ?? report.reporterSteamId}
                            </span>
                            <span className="shrink-0 text-[11px] text-text-muted">
                              {formatDateTime(report.createdAt)}
                            </span>
                          </div>
                          {report.subject && (
                            <div className="mt-1 text-[12px] text-text-muted">{report.subject}</div>
                          )}
                          {report.message && (
                            <p className="mt-1 break-words text-[13px]">{report.message}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}

                {tab === 'stats' && (
                  <>
                    <Section title="Бой" note="за 7 дней">
                      <Cell label="K/D">{data.combat.kd.toFixed(2)}</Cell>
                      <Cell label="Убийств">{data.combat.kills}</Cell>
                      <Cell label="В голову">{data.combat.headshots}</Cell>
                      <Cell label="Смертей">{data.combat.deaths}</Cell>
                    </Section>

                    <Section title="На проекте">
                      <Cell label="Наиграно" wide>
                        {formatDuration(data.playtimeSec)}
                      </Cell>
                      <Cell label="Текущая сессия" wide>
                        {formatDuration(data.sessionSec)}
                      </Cell>
                      <Cell label="Репортов" wide>
                        {data.reportsCount}
                      </Cell>
                      <Cell label="Последний раз" wide>
                        {formatDateTime(data.lastSeenAt)}
                      </Cell>
                    </Section>
                  </>
                )}

                {tab === 'activity' &&
                  (data.activity.length === 0 ? (
                    <Empty text="Событий пока нет" />
                  ) : (
                    <div className="divide-y divide-border overflow-hidden rounded-control border border-border">
                      {data.activity.map((event) => (
                        <div key={event.id} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="flex-1 truncate font-mono text-[12px]">{event.type}</span>
                          <span className="shrink-0 text-[12px] text-text-muted">
                            {event.serverName}
                          </span>
                          <span className="shrink-0 text-[11px] text-text-dim">
                            {formatDateTime(event.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
