'use client';

import { Minus, Plus, X } from 'lucide-react';
import { useState } from 'react';

/**
 * Разметка страниц-настроек: узкая колонка по центру, заголовок,
 * под ним секции из строк «подпись слева — элемент управления справа».
 * Общая для разделов «Настройки» и «Общее» — они устроены одинаково.
 */

export function SettingsPage({
  title,
  note,
  tabs,
  children,
}: {
  title: string;
  note: string;
  tabs?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[860px] px-6 py-10">
      <h1 className="text-[20px] font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-[13px] text-text-muted">{note}</p>

      {tabs}

      <div className={`space-y-8 border-t border-border pt-6 ${tabs ? '' : 'mt-8'}`}>{children}</div>
    </div>
  );
}

export function SettingsTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="mt-6 flex gap-5">
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            aria-current={on ? 'page' : undefined}
            className={`-mb-px border-b-2 pb-2 text-[13px] transition-colors ${
              on
                ? 'border-accent text-white'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-[14px] font-medium">{title}</h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

/** Строка настройки: подпись и пояснение слева, элемент управления справа. */
export function Row({
  label,
  hint,
  disabled,
  control,
}: {
  label: string;
  hint?: string;
  /** Строка выключена другой настройкой — гасим её целиком. */
  disabled?: boolean;
  control: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-4 rounded-plate bg-surface px-4 py-3 transition-opacity ${
        disabled ? 'opacity-45' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13px]">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] text-text-dim">{hint}</div>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/** Строка-действие: вся плашка кликабельна, справа шеврон. */
export function ActionRow({
  label,
  hint,
  tone = 'default',
  busy,
  onClick,
}: {
  label: string;
  hint?: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  onClick: () => void;
}) {
  const color = tone === 'danger' ? 'var(--danger)' : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex w-full items-center gap-4 rounded-plate bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-hover disabled:opacity-50"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13px]" style={{ color }}>
          {label}
        </div>
        {hint && <div className="mt-0.5 text-[12px] text-text-dim">{hint}</div>}
      </div>
      <span className="shrink-0 text-text-dim">›</span>
    </button>
  );
}

export function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:cursor-not-allowed"
      style={{ backgroundColor: checked ? 'var(--accent)' : 'var(--surface-raised)' }}
    >
      <span
        className="absolute top-[3px] h-4 w-4 rounded-full bg-white transition-[left]"
        style={{ left: checked ? 19 : 3 }}
      />
    </button>
  );
}

export function Stepper({
  value,
  min = 0,
  max = 999,
  disabled,
  onChange,
  label,
}: {
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  label: string;
}) {
  const step = (delta: number) => onChange(Math.min(max, Math.max(min, value + delta)));

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`${label}: меньше`}
        disabled={disabled || value <= min}
        onClick={() => step(-1)}
        className="flex h-7 w-7 items-center justify-center rounded-control bg-surface-hover text-text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:opacity-40 disabled:hover:bg-surface-hover"
      >
        <Minus size={13} />
      </button>
      <span className="min-w-[34px] text-center text-[13px] tabular-nums">{value}</span>
      <button
        type="button"
        aria-label={`${label}: больше`}
        disabled={disabled || value >= max}
        onClick={() => step(1)}
        className="flex h-7 w-7 items-center justify-center rounded-control bg-surface-hover text-text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:opacity-40 disabled:hover:bg-surface-hover"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

export function Select({
  value,
  options,
  disabled,
  onChange,
  label,
}: {
  value: number;
  options: { value: number; label: string }[];
  disabled?: boolean;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="cursor-pointer rounded-control bg-transparent py-1 pr-1 text-[13px] text-text outline-none"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-surface-raised">
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Поле-«чипсы»: готовые причины, каждую можно убрать, новую — дописать. */
export function TagInput({
  label,
  hint,
  values,
  placeholder = 'Добавить и нажать Enter',
  maxItems,
  maxLength,
  onChange,
}: {
  label: string;
  hint?: string;
  values: string[];
  placeholder?: string;
  maxItems: number;
  maxLength: number;
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const value = draft.trim().slice(0, maxLength);
    if (!value || values.includes(value) || values.length >= maxItems) {
      setDraft('');
      return;
    }
    onChange([...values, value]);
    setDraft('');
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[12px] text-text-muted">{label}</span>
        {hint && (
          <span
            title={hint}
            className="flex h-[13px] w-[13px] cursor-default items-center justify-center rounded-full border border-border text-[9px] text-text-dim"
          >
            i
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-plate bg-surface px-2.5 py-2">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1.5 rounded-badge bg-surface-hover px-2 py-1 text-[12px]"
          >
            {value}
            <button
              type="button"
              aria-label={`Убрать «${value}»`}
              onClick={() => onChange(values.filter((v) => v !== value))}
              className="text-text-dim transition-colors hover:text-text"
            >
              <X size={11} />
            </button>
          </span>
        ))}

        {values.length < maxItems && (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
              if (e.key === 'Backspace' && !draft && values.length > 0) {
                onChange(values.slice(0, -1));
              }
            }}
            onBlur={add}
            maxLength={maxLength}
            placeholder={values.length === 0 ? placeholder : ''}
            aria-label={label}
            className="min-w-[140px] flex-1 bg-transparent px-1 py-0.5 text-[12px] outline-none placeholder:text-text-dim"
          />
        )}
      </div>
    </div>
  );
}
