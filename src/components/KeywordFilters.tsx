'use client';

import { useEffect, useRef, useState } from 'react';
import { Filter, Palette, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { DEFAULT_HIGHLIGHT_COLOR, type ChatKeyword as Keyword } from '@/lib/chatShared';

export type { Keyword };

interface Props {
  keywords: Keyword[];
  color: string;
  onChange: (data: { keywords: Keyword[]; color: string }) => void;
}

type FiltersResponse = { keywords: Keyword[]; color: string };

export default function KeywordFilters({ keywords, color, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  // Подтверждение очистки живёт 3 секунды, потом кнопка снова обычная.
  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  const send = async (input: RequestInfo, init?: RequestInit) => {
    setBusy(true);
    try {
      const res = await fetch(input, init);
      if (!res.ok) throw new Error(`filters: ${res.status}`);
      onChange((await res.json()) as FiltersResponse);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const addKeyword = async () => {
    const word = draft.trim();
    setDraft('');
    setAdding(false);
    if (!word) return;
    await send('/api/chat/filters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ word }),
    });
  };

  const setColor = (next: string) =>
    send('/api/chat/filters', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ color: next }),
    });

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(59,130,246,0.15)]">
            <Filter size={16} className="text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold leading-tight">Ключевые слова</div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              disabled={busy}
              aria-label="Добавить ключевое слово"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirmClear) {
                  setConfirmClear(true);
                  return;
                }
                setConfirmClear(false);
                void send('/api/chat/filters', { method: 'DELETE' });
              }}
              disabled={busy || keywords.length === 0}
              aria-label={confirmClear ? 'Подтвердить очистку' : 'Очистить список'}
              title={confirmClear ? 'Нажмите ещё раз для очистки' : 'Очистить список'}
              className="flex h-7 w-7 items-center justify-center rounded-md text-white transition-colors disabled:opacity-40"
              style={{ backgroundColor: confirmClear ? '#b91c1c' : 'var(--danger)' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="mt-2 text-[12px] text-text-muted">Подсветка сообщений в ленте</div>

        {adding && (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addKeyword();
              if (e.key === 'Escape') {
                setDraft('');
                setAdding(false);
              }
            }}
            onBlur={() => void addKeyword()}
            maxLength={40}
            placeholder="Новое слово"
            className="mt-3 h-9 w-full rounded-control border border-border bg-surface-hover px-3 text-[13px] text-text placeholder:text-text-muted"
          />
        )}
      </div>

      <div className="card p-4">
        <div className="flex items-start gap-2">
          <Palette size={14} className="mt-0.5 shrink-0 text-text-muted" />
          <div className="text-[12px] leading-snug text-text-muted">
            Цвет пометки сообщений с ключевыми словами:
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => void setColor(e.target.value)}
            disabled={busy}
            aria-label="Цвет пометки"
            className="h-8 w-11 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
          />
          <span className="flex-1 font-mono text-[12px] text-text-muted">{color}</span>
          <button
            type="button"
            onClick={() => void setColor(DEFAULT_HIGHLIGHT_COLOR)}
            disabled={busy || color === DEFAULT_HIGHLIGHT_COLOR}
            aria-label="Вернуть цвет по умолчанию"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-surface-hover disabled:opacity-40"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {keywords.map((keyword) => (
        <div key={keyword.id} className="card flex items-center gap-2 p-4">
          <span className="min-w-0 flex-1 truncate text-[13px]">{keyword.word}</span>
          <button
            type="button"
            onClick={() => void send(`/api/chat/filters/${keyword.id}`, { method: 'DELETE' })}
            disabled={busy}
            aria-label={`Удалить «${keyword.word}»`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white transition-colors disabled:opacity-60"
            style={{ backgroundColor: 'var(--danger)' }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
