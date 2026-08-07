'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LogIn, Users, X } from 'lucide-react';
import type { PanelEvent } from '@/lib/types';

const AUTO_HIDE_MS = 8000;
const POLL_INTERVAL_MS = 10_000;
const MAX_TOASTS = 5;

interface Toast {
  id: string;
  kind: 'connected' | 'multiaccount';
  name: string;
  count?: number;
  serverName: string;
}

function toToast(event: PanelEvent): Toast | null {
  const payload = event.payload as { name?: string; steamId?: string; count?: number };
  const name = payload.name ?? payload.steamId ?? 'Неизвестный';

  if (event.type === 'player_connected') {
    return { id: event.id, kind: 'connected', name, serverName: event.serverName };
  }
  if (event.type === 'multiaccount_detected') {
    return {
      id: event.id,
      kind: 'multiaccount',
      name,
      count: payload.count ?? 0,
      serverName: event.serverName,
    };
  }
  return null;
}

export default function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const lastEventId = useRef<string | null>(null);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((event: PanelEvent) => {
    if (seenIds.current.has(event.id)) return;
    seenIds.current.add(event.id);
    lastEventId.current = event.id;

    const toast = toToast(event);
    if (!toast) return;

    setToasts((prev) => [...prev, toast].slice(-MAX_TOASTS));
    setTimeout(() => dismiss(toast.id), AUTO_HIDE_MS);
  }, [dismiss]);

  useEffect(() => {
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    // Фолбэк на поллинг раз в 10 секунд, если SSE недоступен.
    const startPolling = () => {
      if (pollTimer || cancelled) return;
      const tick = async () => {
        try {
          const url = new URL('/api/events/stream', window.location.origin);
          url.searchParams.set('poll', '1');
          if (lastEventId.current) url.searchParams.set('lastId', lastEventId.current);
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) return;
          const data = (await res.json()) as { events: PanelEvent[] };
          data.events.forEach(push);
        } catch {
          /* панель недоступна — попробуем на следующем тике */
        }
      };
      void tick();
      pollTimer = setInterval(tick, POLL_INTERVAL_MS);
    };

    if (typeof window !== 'undefined' && 'EventSource' in window) {
      source = new EventSource('/api/events/stream');
      source.addEventListener('panel', (e) => {
        try {
          push(JSON.parse((e as MessageEvent).data) as PanelEvent);
        } catch {
          /* битый кадр — игнорируем */
        }
      });
      source.onerror = () => {
        source?.close();
        source = null;
        startPolling();
      };
    } else {
      startPolling();
    }

    return () => {
      cancelled = true;
      source?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [push]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-[320px] flex-col-reverse gap-3">
      {toasts.map((toast) => {
        const isMulti = toast.kind === 'multiaccount';
        const Icon = isMulti ? Users : LogIn;

        return (
          <div
            key={toast.id}
            className="relative overflow-hidden rounded-plate border border-border bg-surface p-4 pl-5"
          >
            <span
              className="absolute inset-y-0 left-0 w-[2px]"
              style={{
                background: isMulti
                  ? 'linear-gradient(180deg, #ec4899 0%, #6c5ce7 100%)'
                  : 'linear-gradient(180deg, #7d6ff0 0%, #6c5ce7 100%)',
              }}
            />

            <div className="flex items-start gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{
                  backgroundColor: isMulti ? 'rgba(236,72,153,0.15)' : 'rgba(59,130,246,0.15)',
                }}
              >
                <Icon size={16} style={{ color: isMulti ? '#ec4899' : 'var(--accent)' }} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-[13px] leading-snug">
                  <span className="font-semibold">{toast.name}</span>{' '}
                  {isMulti ? `— мультиаккаунт (${toast.count})` : 'вошёл на сервер'}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-text-muted">{toast.serverName}</div>
              </div>

              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Закрыть"
                className="shrink-0 rounded p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
