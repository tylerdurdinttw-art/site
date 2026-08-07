'use client';

import { useState } from 'react';
import { LockOpen, Trash2, TriangleAlert, Zap } from 'lucide-react';

interface Props {
  activeCount: number;
  totalCount: number;
  busy: boolean;
  onUnbanAll: () => void;
  onClearHistory: () => void;
}

type Pending = 'unban' | 'clear' | null;

/** Оба действия необратимы, поэтому каждое подтверждается отдельным диалогом. */
export default function BanBulkActions({
  activeCount,
  totalCount,
  busy,
  onUnbanAll,
  onClearHistory,
}: Props) {
  const [pending, setPending] = useState<Pending>(null);

  const dialog =
    pending === 'unban'
      ? {
          title: 'Разбанить всех игроков?',
          body: `Будет снято активных банов: ${activeCount}. Панель поставит серверам команду unbanid на каждого — игроки смогут зайти снова.`,
          confirm: 'Разбанить всех',
          color: 'var(--danger)',
          run: onUnbanAll,
        }
      : pending === 'clear'
        ? {
            title: 'Удалить всю историю банов?',
            body: `Из панели пропадут все записи: ${totalCount}. На игровом сервере это ничего не меняет — забаненные останутся забаненными, панель просто забудет о них.`,
            confirm: 'Удалить историю',
            color: '#f59e0b',
            run: onClearHistory,
          }
        : null;

  return (
    <div className="card relative overflow-hidden p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(245,158,11,0.15)]">
          <Zap size={17} style={{ color: '#f59e0b' }} />
        </div>
        <div>
          <div className="text-[15px] font-semibold leading-tight">Массовые действия</div>
          <div className="text-[12px] text-text-muted">
            Действия со всеми банами (только для администраторов)
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          disabled={busy || activeCount === 0}
          onClick={() => setPending('unban')}
          className="inline-flex items-center justify-center gap-2 rounded-control py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)' }}
        >
          <LockOpen size={15} />
          Разбанить всех игроков
        </button>

        <button
          type="button"
          disabled={busy || totalCount === 0}
          onClick={() => setPending('clear')}
          className="inline-flex items-center justify-center gap-2 rounded-control py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: 'linear-gradient(90deg, #f59e0b 0%, #ea9a0b 100%)' }}
        >
          <Trash2 size={15} />
          Удалить всю историю банов
        </button>
      </div>

      {dialog && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center p-5"
          style={{ backgroundColor: 'rgba(4,4,8,0.86)' }}
          onClick={() => setPending(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-[520px] rounded-plate border border-border bg-surface p-5"
            role="dialog"
            aria-modal="true"
            aria-label={dialog.title}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <TriangleAlert size={18} className="mt-0.5 shrink-0" style={{ color: dialog.color }} />
              <div className="min-w-0">
                <div className="text-[14px] font-semibold">{dialog.title}</div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-text-muted">{dialog.body}</p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="rounded-control border border-border px-4 py-2 text-[13px] text-text-muted transition-colors hover:bg-surface-hover"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  dialog.run();
                  setPending(null);
                }}
                className="rounded-control px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: dialog.color }}
              >
                {dialog.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
