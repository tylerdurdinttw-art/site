'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { IpLookup } from '@/lib/ipLookup';
import type { PlayerStatus } from '@/lib/types';

const STATUS_COLOR: Record<PlayerStatus, string> = {
  online: 'var(--success)',
  sleeping: 'var(--warning)',
  offline: 'var(--text-dim)',
};

const DASH = '—';

/**
 * IP-адрес в карточке игрока. Клик раскрывает окошко: кто ещё играет с этого адреса,
 * а также провайдер, город и страна.
 */
export default function IpLink({ ip }: { ip: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<IpLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLSpanElement>(null);

  // Данные тянем один раз, при первом раскрытии.
  useEffect(() => {
    if (!open || data || error) return;

    void (async () => {
      try {
        const res = await fetch(`/api/ip?address=${encodeURIComponent(ip)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`ip: ${res.status}`);
        setData((await res.json()) as IpLookup);
      } catch (err) {
        console.error(err);
        setError('Не удалось получить данные по адресу.');
      }
    })();
  }, [open, data, error, ip]);

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

  if (!ip) return <span className="text-text-muted">{DASH}</span>;

  return (
    <span className="relative inline-block" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Кто ещё играет с адреса ${ip}`}
        className="inline-flex items-center gap-1.5 font-mono text-accent transition-colors hover:text-accent-hover"
      >
        {ip}
        <ExternalLink size={12} />
      </button>

      {open && (
        <span className="card absolute left-0 top-[calc(100%+6px)] z-40 block w-[280px] p-3 text-left shadow-xl">
          <span className="block font-mono text-[13px]">{ip}</span>

          {error && (
            <span className="mt-2 block text-[12px]" style={{ color: 'var(--danger)' }}>
              {error}
            </span>
          )}

          {!data && !error && (
            <span className="mt-2 block text-[12px] text-text-muted">Загрузка…</span>
          )}

          {data && (
            <>
              <span className="mt-2 block space-y-1">
                <Field label="Провайдер" value={data.isp} danger={data.isVpn === true} />
                <Field label="Город" value={data.city} />
                <Field label="Страна" value={data.country} />
                {data.isVpn && (
                  <span className="block text-[11px]" style={{ color: 'var(--danger)' }}>
                    Похоже на VPN или хостинг
                  </span>
                )}
              </span>

              <span className="mt-3 block border-t border-border pt-2">
                <span className="block text-[12px] text-text-muted">
                  С этого адреса играют: {data.neighbours.length}
                </span>

                <span className="mt-1.5 block max-h-[168px] space-y-1 overflow-y-auto scrollbar-thin">
                  {data.neighbours.length === 0 && (
                    <span className="block text-[12px] text-text-dim">Никого больше не видели</span>
                  )}

                  {data.neighbours.map((neighbour) => (
                    <span key={neighbour.steamId} className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: STATUS_COLOR[neighbour.status] }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[12px]">{neighbour.name}</span>
                      {!neighbour.current && (
                        <span className="shrink-0 text-[10px] text-text-dim">раньше</span>
                      )}
                    </span>
                  ))}
                </span>
              </span>
            </>
          )}
        </span>
      )}
    </span>
  );
}

function Field({
  label,
  value,
  danger,
}: {
  label: string;
  value: string | null;
  danger?: boolean;
}) {
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[12px] text-text-muted">{label}</span>
      <span
        className="min-w-0 truncate text-[12px]"
        style={danger ? { color: 'var(--danger)' } : undefined}
      >
        {value || DASH}
      </span>
    </span>
  );
}
