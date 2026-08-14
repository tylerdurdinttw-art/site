'use client';

import { CalendarClock, ExternalLink } from 'lucide-react';
import { APP_NAME, SUPPORT_DISCORD_URL } from '@/lib/brand';
import { formatAccessDate } from '@/lib/accessShared';
import type { ProjectState } from '@/lib/projectShared';

/**
 * Раздел «Продление». Он же — экран, который панель показывает вместо разделов,
 * когда оплаченный срок вышел: другого выхода, кроме как написать нам, тут нет.
 */
export default function RenewView({ project }: { project: ProjectState }) {
  const { access } = project;

  return (
    <div className="mx-auto w-full max-w-[860px] px-6 py-10">
      <h1 className="text-[20px] font-semibold tracking-tight">Продление</h1>
      <p className="mt-1 text-[13px] text-text-muted">Срок доступа проекта к {APP_NAME}</p>

      <div className="mt-8 space-y-4 border-t border-border pt-6">
        <div className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3.5">
          <CalendarClock
            size={18}
            className="shrink-0"
            style={{ color: access.active ? 'var(--success)' : 'var(--danger)' }}
          />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">
              {access.active ? 'Доступ активен' : 'Доступ закрыт'}
            </div>
            <div className="text-[12px] text-text-muted">
              {access.expiresAt
                ? access.active
                  ? `Действует до ${formatAccessDate(access.expiresAt)} · осталось дней: ${access.daysLeft}`
                  : `Срок вышел ${formatAccessDate(access.expiresAt)}`
                : 'Доступ ещё не выдавался'}
            </div>
          </div>
        </div>

        <div className="rounded-card border border-border p-5">
          <p className="text-[13px] leading-relaxed">
            Чтобы продлить подписку, вам нужно связаться с нами в дискорде:{' '}
            <a
              href={SUPPORT_DISCORD_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-accent transition-colors hover:text-accent-hover"
            >
              {SUPPORT_DISCORD_URL}
              <ExternalLink size={13} />
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
