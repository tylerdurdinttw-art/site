'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, FileCode2, Settings, Trash2, Users } from 'lucide-react';
import type { ServerRow } from '@/lib/overview';
import { APP_VERSION } from '@/lib/version';

const PLUGIN_FILE = 'YnaziCotTvBridge.cs';

interface Props {
  server: ServerRow;
  /** Открыть окно переподключения для этого сервера. */
  onReconnect: (serverId: string) => void;
  /** Сервер удалён — список нужно перечитать. */
  onDeleted: () => void;
}

/** Карточка сервера: превью карты, название, заполненность и версия панели. */
export default function ServerTile({ server, onReconnect, onDeleted }: Props) {
  const [bannerFailed, setBannerFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const ratio = server.maxPlayers > 0 ? Math.min(1, server.players / server.maxPlayers) : 0;
  const hasBanner = Boolean(server.seed && server.worldSize) && !bannerFailed;

  // Клик мимо меню его закрывает.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${encodeURIComponent(server.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`server: ${res.status}`);
      setConfirmDelete(false);
      onDeleted();
    } catch (err) {
      console.error(err);
      setError('Сервер не удалён — панель недоступна.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-card border border-border bg-surface">
      <div className="relative h-[104px] overflow-hidden rounded-t-card bg-surface-hover">
        {hasBanner ? (
          // Карта лежит в кеше панели и отдаётся своим эндпоинтом — оптимизатор next/image не нужен.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/map/image?serverId=${encodeURIComponent(server.id)}`}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setBannerFailed(true)}
          />
        ) : (
          <div
            className="h-full w-full"
            style={{ background: 'linear-gradient(135deg, #2a2418 0%, #1a1a1f 100%)' }}
          />
        )}
      </div>

      <div className="flex items-center gap-3 px-3 py-3">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-plate bg-surface-hover text-[13px] font-semibold text-text-muted">
          {server.name.slice(0, 1).toUpperCase()}
          <span
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2"
            style={{
              backgroundColor: server.online ? 'var(--success)' : 'var(--text-dim)',
              borderColor: 'var(--surface)',
            }}
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{server.name}</div>
          <div className="text-[12px]" style={{ color: 'var(--success)' }}>
            Procedural Map
          </div>
        </div>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            title="Настройки сервера"
            aria-label="Настройки сервера"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-hover text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
          >
            <Settings size={14} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+4px)] z-20 w-[190px] overflow-hidden rounded-control border border-border bg-surface-raised py-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onReconnect(server.id);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-hover"
              >
                <ArrowLeftRight size={14} className="text-text-muted" />
                Переподключить
              </button>

              <a
                href="/api/plugin/download"
                download={PLUGIN_FILE}
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-hover"
              >
                <FileCode2 size={14} className="text-text-muted" />
                Скачать плагин
              </a>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setError(null);
                  setConfirmDelete(true);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-hover"
                style={{ color: 'var(--danger)' }}
              >
                <Trash2 size={14} />
                Удалить
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="px-3">
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-hover">
          <div
            className="h-full rounded-full"
            style={{ width: `${ratio * 100}%`, backgroundColor: 'var(--accent)' }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-2.5 text-[12px] text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Users size={13} />
          {server.players}/{server.maxPlayers || '—'}
        </span>
        <span>{APP_VERSION}</span>
      </div>

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(4,4,6,0.72)' }}
          onClick={() => setConfirmDelete(false)}
          role="presentation"
        >
          <div
            className="card w-full max-w-[420px] p-5"
            role="dialog"
            aria-modal="true"
            aria-label="Удалить сервер"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-semibold">Удалить «{server.name}»?</div>
            <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
              Вместе с сервером пропадут его сессии, события, репорты, баны и проверки. Если
              сервер просто переехал или потерял ключи, выберите «Переподключить» — данные
              останутся на месте.
            </p>

            {error && (
              <div className="mt-3 text-[12px]" style={{ color: 'var(--danger)' }}>
                {error}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)} className="btn-ghost py-2">
                Отмена
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void remove()}
                className="rounded-control px-4 py-2 text-[13px] font-medium text-white transition-opacity disabled:opacity-50"
                style={{ backgroundColor: 'var(--danger)' }}
              >
                {deleting ? 'Удаляем…' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
