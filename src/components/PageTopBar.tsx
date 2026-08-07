'use client';

import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

interface Props {
  title: string;
  /** Строка поиска справа; без onSearch поле не рисуется. */
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  /** Содержимое выпадающей панели фильтров; без него кнопка не рисуется. */
  filters?: React.ReactNode;
  /** Подсветить кнопку — например, когда фильтр отличается от значения по умолчанию. */
  filtersActive?: boolean;
  children?: React.ReactNode;
}

/** Шапка раздела: название слева, поиск и действия справа. */
export default function PageTopBar({
  title,
  search,
  onSearch,
  searchPlaceholder = 'Поиск',
  filters,
  filtersActive,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Клик мимо панели и Escape её закрывают.
  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="sticky top-0 z-20 flex h-[58px] items-center gap-3 border-b border-border bg-bg px-6">
      <h1 className="text-[15px] font-semibold">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        {children}

        {onSearch && (
          <input
            value={search ?? ''}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="field h-9 w-[230px] py-0 text-[13px]"
          />
        )}

        {filters && (
          <div className="relative" ref={boxRef}>
            <button
              type="button"
              title="Фильтры"
              aria-label="Фильтры"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control border transition-colors ${
                open || filtersActive
                  ? 'border-border-strong bg-surface-hover text-text'
                  : 'border-border bg-surface text-text-muted hover:bg-surface-hover'
              }`}
            >
              <SlidersHorizontal size={15} />
            </button>

            {open && (
              <div className="card absolute right-0 top-[calc(100%+6px)] z-30 w-[260px] p-3 shadow-xl">
                {filters}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Одна группа в панели фильтров: подпись и список вариантов. */
export function FilterGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 text-[12px] text-text-muted">{label}</div>
      <div className="space-y-0.5">
        {options.map((option) => {
          const on = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                on ? 'bg-surface-hover text-white' : 'text-text-muted hover:bg-surface-hover'
              }`}
            >
              <span
                className={`h-3 w-3 shrink-0 rounded-full border ${
                  on ? 'border-accent' : 'border-border-strong'
                }`}
                style={on ? { boxShadow: 'inset 0 0 0 2.5px var(--accent)' } : undefined}
              />
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
