'use client';

import { Filter, Hash, MessageSquareText, Search, Server, User, X } from 'lucide-react';
import type { BanFilters as Filters, BanStatusFilter } from '@/lib/bansShared';

interface Props {
  filters: Filters;
  servers: { id: string; name: string }[];
  onChange: (next: Filters) => void;
  onClear: () => void;
}

const STATUS_OPTIONS: { value: BanStatusFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'active', label: 'Активные' },
  { value: 'lifted', label: 'Снятые' },
];

const inputClass =
  'w-full rounded-control border border-border bg-surface-hover px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-accent';

function Label({ icon, text, color }: { icon: React.ReactNode; text: string; color: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="flex h-3.5 w-3.5 items-center justify-center" style={{ color }}>
        {icon}
      </span>
      <span className="text-[12px] text-text-muted">{text}</span>
    </div>
  );
}

export default function BanFilters({ filters, servers, onChange, onClear }: Props) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(59,130,246,0.15)]">
          <Search size={17} className="text-accent" />
        </div>
        <div>
          <div className="text-[15px] font-semibold leading-tight">Поиск и фильтры</div>
          <div className="text-[12px] text-text-muted">Поиск банов по различным параметрам</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <div>
          <Label icon={<User size={13} />} text="Поиск по нику" color="var(--accent)" />
          <input
            value={filters.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Введите имя игрока"
            className={inputClass}
          />
        </div>

        <div>
          <Label icon={<Hash size={13} />} text="Поиск по Steam ID" color="#60a5fa" />
          <input
            value={filters.steamId}
            onChange={(e) => set('steamId', e.target.value)}
            placeholder="Введите Steam ID"
            className={`${inputClass} font-mono`}
          />
        </div>

        <div>
          <Label
            icon={<MessageSquareText size={13} />}
            text="Поиск по причине"
            color="var(--accent)"
          />
          <input
            value={filters.reason}
            onChange={(e) => set('reason', e.target.value)}
            placeholder="Введите причину бана"
            className={inputClass}
          />
        </div>

        <div>
          <Label icon={<Server size={13} />} text="Фильтр по серверу" color="#60a5fa" />
          <select
            value={filters.serverId}
            onChange={(e) => set('serverId', e.target.value)}
            aria-label="Фильтр по серверу"
            className={inputClass}
          >
            <option value="all">Все сервера</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-3">
          <div className="min-w-[150px] flex-1">
            <Label icon={<Filter size={13} />} text="Статус" color="var(--warning)" />
            <select
              value={filters.status}
              onChange={(e) => set('status', e.target.value as BanStatusFilter)}
              aria-label="Статус"
              className={inputClass}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onClear}
            className="inline-flex shrink-0 items-center gap-2 rounded-control border border-border px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-surface-hover"
          >
            <X size={14} />
            Очистить фильтры
          </button>
        </div>
      </div>
    </div>
  );
}
