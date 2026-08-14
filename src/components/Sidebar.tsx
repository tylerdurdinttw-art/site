'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Building2,
  CalendarClock,
  ChevronDown,
  Code2,
  HardDrive,
  LogOut,
  Map,
  MessageSquare,
  PanelLeft,
  Plug,
  Rocket,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Users,
  UserSquare,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { SessionUser } from '@/lib/authShared';
import type { ProjectState } from '@/lib/projectShared';
import { isDeveloper } from '@/lib/devShared';

interface Item {
  label: string;
  icon: LucideIcon;
  /** Цвет иконки; без него — приглушённый по умолчанию. */
  color?: string;
  /** Задан только у пунктов, для которых есть страница. Остальные — заглушки. */
  href?: string;
}

interface Group {
  title: string;
  items: Item[];
}

const START: Item = { label: 'Начало работы', icon: Rocket, color: '#f59e0b', href: '/start' };

const GROUPS: Group[] = [
  {
    title: 'Модерация',
    items: [
      { label: 'Игроки', icon: Users, color: '#93a4c0', href: '/players' },
      { label: 'Чат', icon: MessageSquare, color: '#93a4c0', href: '/chat' },
      { label: 'Репорты', icon: Shield, color: '#ef4444', href: '/reports' },
      { label: 'Проверки', icon: ShieldCheck, color: '#22c55e', href: '/checks' },
      { label: 'Карта', icon: Map, color: '#34d399', href: '/map' },
      { label: 'Блокировки', icon: Ban, color: '#d4d4d8', href: '/bans' },
    ],
  },
  {
    title: 'Управление',
    items: [
      { label: 'Серверы', icon: HardDrive, color: '#93a4c0', href: '/servers' },
      { label: 'Интеграции', icon: Plug, color: '#a78bfa', href: '/integrations' },
      { label: 'Настройки', icon: Settings, color: '#d4d4d8', href: '/settings' },
    ],
  },
  {
    title: 'Проект',
    items: [
      { label: 'Общее', icon: Building2, color: '#93a4c0', href: '/general' },
      { label: 'Сотрудники', icon: UserSquare, color: '#93a4c0', href: '/staff' },
      { label: 'Продление', icon: CalendarClock, color: '#f59e0b', href: '/renew' },
    ],
  },
];

/**
 * Служебный раздел разработчиков сайта. В общий список не входит: его дописывает
 * groupsFor() тем логинам, что есть в DEVELOPER_LOGINS. Само по себе меню ничего
 * не открывает — страница и её эндпоинты проверяют логин заново.
 */
const DEV_ITEM: Item = { label: 'Разработка', icon: Code2, color: '#f472b6', href: '/dev' };

function groupsFor(dev: boolean): Group[] {
  if (!dev) return GROUPS;
  return GROUPS.map((group) =>
    group.title === 'Проект' ? { ...group, items: [...group.items, DEV_ITEM] } : group,
  );
}

/**
 * Кликабельны только пункты с `href`. Остальные рендерятся как <div>
 * с `cursor: default` — раздела за ними ещё нет либо доступ закрыт.
 */
function NavItem({
  item,
  active,
  collapsed,
  disabled,
}: {
  item: Item;
  active: boolean;
  collapsed: boolean;
  disabled?: boolean;
}) {
  const Icon = item.icon;

  const content = (
    <>
      <Icon
        size={16}
        className="shrink-0"
        style={{ color: active ? '#fff' : (item.color ?? 'var(--text-muted)') }}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </>
  );

  const base = `flex items-center rounded-control text-[13px] transition-colors ${
    collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-[7px]'
  }`;
  const state = active
    ? 'bg-surface-hover font-medium text-white'
    : 'text-text-muted hover:bg-surface hover:text-text';

  if (item.href && !disabled) {
    return (
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        className={`${base} ${state}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      title={disabled ? 'Доступ к панели закончился' : collapsed ? item.label : undefined}
      className={`${base} cursor-default ${state} ${disabled ? 'opacity-40' : ''}`}
    >
      {content}
    </div>
  );
}

/** Что показывает поиск: разделы панели и игроки, найденные по нику или SteamID. */
interface SearchPlayer {
  steamId: string;
  name: string;
  serverName: string;
}

/** Разделы, по которым ищет поле в сайдбаре — только те, у которых есть страница. */
function searchableFor(groups: Group[]): { label: string; href: string; icon: LucideIcon }[] {
  return [
    { label: START.label, href: START.href!, icon: START.icon },
    ...groups.flatMap((group) =>
      group.items
        .filter((item): item is Item & { href: string } => Boolean(item.href))
        .map((item) => ({ label: item.label, href: item.href, icon: item.icon })),
    ),
  ];
}

function SearchResults({
  sections,
  players,
  loading,
  onPick,
}: {
  sections: { label: string; href: string; icon: LucideIcon }[];
  players: SearchPlayer[];
  loading: boolean;
  onPick: () => void;
}) {
  const empty = sections.length === 0 && players.length === 0 && !loading;

  return (
    <div className="space-y-4">
      {sections.length > 0 && (
        <div>
          <div className="px-3 pb-1.5 pt-1 text-[12px] text-text-dim">Разделы</div>
          <div className="space-y-0.5">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  onClick={onPick}
                  className="flex items-center gap-3 rounded-control px-3 py-[7px] text-[13px] text-text-muted transition-colors hover:bg-surface hover:text-text"
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="truncate">{section.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {(players.length > 0 || loading) && (
        <div>
          <div className="px-3 pb-1.5 pt-1 text-[12px] text-text-dim">Игроки</div>
          {loading && <div className="px-3 py-1 text-[12px] text-text-dim">Ищем…</div>}
          <div className="space-y-0.5">
            {players.map((player) => (
              <Link
                key={player.steamId}
                // Карточка игрока открывается по этому параметру на странице «Игроки».
                href={`/players?player=${player.steamId}`}
                onClick={onPick}
                className="flex items-center gap-3 rounded-control px-3 py-[7px] transition-colors hover:bg-surface"
              >
                <Users size={16} className="shrink-0 text-text-dim" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px]">{player.name}</span>
                  <span className="block truncate font-mono text-[11px] text-text-dim">
                    {player.steamId}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {empty && <div className="px-3 py-2 text-[12px] text-text-dim">Ничего не найдено</div>}
    </div>
  );
}

function ProjectLogo({ hasLogo, size }: { hasLogo: boolean; size: number }) {
  if (hasLogo) {
    // Картинка лежит в базе и отдаётся своим эндпоинтом — оптимизатор next/image тут не нужен.
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src="/api/project/logo"
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-md object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-md bg-surface-hover text-[11px] font-semibold text-text-muted"
      style={{ width: size, height: size }}
    >
      R
    </span>
  );
}

/** Подвал сайдбара: под каким аккаунтом сидим и кнопка выхода. */
function AccountBlock({ user, collapsed }: { user: SessionUser; collapsed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.replace('/login');
      router.refresh();
    } catch (err) {
      console.error(err);
      setBusy(false);
    }
  };

  const initial = user.login.slice(0, 1).toUpperCase();

  if (collapsed) {
    return (
      <div className="border-t border-border px-3 py-3">
        <button
          type="button"
          onClick={() => void logout()}
          disabled={busy}
          title={`${user.login} — выйти`}
          aria-label="Выйти"
          className="mx-auto flex h-8 w-8 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-surface hover:text-text"
        >
          <LogOut size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 border-t border-border px-4 py-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[11px] font-semibold text-text-muted">
        {initial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{user.login}</span>
        <span className="block truncate text-[11px] text-text-dim">{user.email}</span>
      </span>
      <button
        type="button"
        onClick={() => void logout()}
        disabled={busy}
        title="Выйти"
        aria-label="Выйти"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-text"
      >
        <LogOut size={15} />
      </button>
    </div>
  );
}

export default function Sidebar({
  project,
  user,
  expired = false,
}: {
  project: ProjectState;
  user: SessionUser;
  /** Срок доступа вышел: открыт только раздел «Продление». */
  expired?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState<SearchPlayer[] | null>(null);
  const [playersLoading, setPlayersLoading] = useState(false);

  const isActive = (href?: string) => Boolean(href && pathname === href);

  // Разработчику дописывается «Разработка», и она остаётся живой даже с закрытым
  // доступом: срок продлевают как раз из неё.
  const dev = isDeveloper(user.login);
  const groups = useMemo(() => groupsFor(dev), [dev]);
  const searchable = useMemo(() => searchableFor(groups), [groups]);
  const isLocked = (href?: string) =>
    expired && href !== '/renew' && !(dev && href === DEV_ITEM.href);

  const trimmed = query.trim();
  // В свёрнутом виде поля нет, поэтому и выдачу показывать негде.
  // С закрытым доступом поиска тоже нет: за игроками он ходит в закрытый API.
  const searching = !collapsed && !expired && trimmed.length > 0;

  // Список игроков нужен только для поиска — тянем его один раз, с первым запросом.
  useEffect(() => {
    if (!searching || players !== null || playersLoading) return;

    setPlayersLoading(true);
    void (async () => {
      try {
        const res = await fetch('/api/players', { cache: 'no-store' });
        if (!res.ok) throw new Error(`players: ${res.status}`);
        const data = (await res.json()) as { players: SearchPlayer[] };
        setPlayers(data.players);
      } catch (err) {
        console.error(err);
        setPlayers([]);
      } finally {
        setPlayersLoading(false);
      }
    })();
  }, [searching, players, playersLoading]);

  const needle = trimmed.toLowerCase();

  const foundSections = useMemo(() => {
    if (!searching) return [];
    return searchable.filter((item) => item.label.toLowerCase().includes(needle));
  }, [searching, searchable, needle]);

  const foundPlayers = useMemo(() => {
    if (!searching || !players) return [];
    return players
      .filter((p) => p.name.toLowerCase().includes(needle) || p.steamId.includes(trimmed))
      .slice(0, 8);
  }, [searching, players, needle, trimmed]);

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col border-r border-border bg-bg-sidebar transition-[width] duration-150 ${
        collapsed ? 'w-[64px]' : 'w-[248px]'
      }`}
    >
      <div className={`flex items-center gap-2.5 px-4 py-4 ${collapsed ? 'justify-center' : ''}`}>
        <ProjectLogo hasLogo={project.hasLogo} size={22} />
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-tight">
            {project.name}
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          className={`flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-text ${
            collapsed ? 'hidden' : ''
          }`}
        >
          <PanelLeft size={15} />
        </button>
      </div>

      {/* С закрытым доступом поиск убран совсем: искать в нём нечего. */}
      {expired ? null : collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Развернуть меню"
          className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-surface hover:text-text"
        >
          <Search size={15} />
        </button>
      ) : (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-[7px] focus-within:border-border-strong">
            <Search size={14} className="shrink-0 text-text-dim" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuery('');
              }}
              placeholder="Поиск..."
              aria-label="Поиск по панели"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-dim"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Очистить поиск"
                className="shrink-0 text-text-dim transition-colors hover:text-text"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      <nav className="flex-1 space-y-4 overflow-y-auto scrollbar-thin px-3 pb-4">
        {searching ? (
          <SearchResults
            sections={foundSections}
            players={foundPlayers}
            loading={playersLoading}
            onPick={() => setQuery('')}
          />
        ) : (
          <>
            <NavItem
              item={START}
              active={isActive(START.href)}
              collapsed={collapsed}
              disabled={expired}
            />

            {groups.map((group) => {
              const open = openGroups[group.title] !== false;
              return (
                <div key={group.title}>
                  {!collapsed && (
                    <button
                      type="button"
                      onClick={() =>
                        setOpenGroups((prev) => ({ ...prev, [group.title]: !open }))
                      }
                      aria-expanded={open}
                      className="flex w-full items-center gap-1 px-3 pb-1.5 pt-1 text-[12px] text-text-dim transition-colors hover:text-text-muted"
                    >
                      {group.title}
                      <ChevronDown
                        size={13}
                        className={`transition-transform ${open ? '' : '-rotate-90'}`}
                      />
                    </button>
                  )}
                  {open && (
                    <div className="space-y-0.5">
                      {group.items.map((item) => (
                        <NavItem
                          key={item.label}
                          item={item}
                          active={isActive(item.href)}
                          collapsed={collapsed}
                          disabled={isLocked(item.href)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </nav>

      <AccountBlock user={user} collapsed={collapsed} />
    </aside>
  );
}
