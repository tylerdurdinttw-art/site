'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PERMISSIONS } from '@/lib/permissions';

interface Invite {
  projectName: string;
  projectSlug: string;
  name: string;
  permissions: string[];
  taken: boolean;
}

const LABELS = new Map(PERMISSIONS.map((p) => [p.key as string, p.label]));

/** Экран по ссылке /invite/<код>: что за проект и с какими правами зовут. */
export default function AcceptInvite({ code, invite }: { code: string; invite: Invite | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const accept = useCallback(async () => {
    if (sending) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch('/api/project/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const body = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(body.error ?? 'Не удалось войти в проект.');
        return;
      }

      router.replace('/players');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Панель не отвечает. Попробуйте ещё раз.');
    } finally {
      setSending(false);
    }
  }, [code, sending, router]);

  if (!invite) {
    return (
      <div className="w-full max-w-[350px]">
        <h1 className="text-[19px] font-semibold leading-tight">Приглашение не найдено</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Ссылка неверна или приглашение отозвали. Попросите владельца проекта выдать новое.
        </p>
        <button type="button" onClick={() => router.replace('/welcome')} className="btn-primary mt-6 w-full">
          К выбору проекта
        </button>
      </div>
    );
  }

  if (invite.taken) {
    return (
      <div className="w-full max-w-[350px]">
        <h1 className="text-[19px] font-semibold leading-tight">Приглашение уже использовано</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          По этой ссылке в «{invite.projectName}» уже вошли. Один код пускает одного человека —
          попросите владельца выдать вам свой.
        </p>
        <button type="button" onClick={() => router.replace('/welcome')} className="btn-primary mt-6 w-full">
          К выбору проекта
        </button>
      </div>
    );
  }

  const granted = invite.permissions.map((key) => LABELS.get(key) ?? key);

  return (
    <div className="w-full max-w-[350px]">
      <h1 className="text-[19px] font-semibold leading-tight">Приглашение в «{invite.projectName}»</h1>
      <p className="mt-1 text-[13px] text-text-muted">
        Вас записали как «{invite.name}». Приняв приглашение, вы попадёте в панель этого проекта.
      </p>

      <div className="mt-6 rounded-plate border border-border bg-surface p-4">
        <div className="text-[12px] text-text-muted">Права в проекте</div>
        {granted.length === 0 ? (
          <p className="mt-1.5 text-[13px] leading-relaxed">
            Пока никаких — их выдаст владелец после того, как вы войдёте.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {granted.map((label) => (
              <span
                key={label}
                className="rounded-badge bg-surface-hover px-2.5 py-1 text-[12px] font-medium"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div
          className="mt-4 rounded-control px-3 py-2 text-[12px]"
          style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }}
        >
          {error}
        </div>
      )}

      <button
        type="button"
        disabled={sending}
        onClick={() => void accept()}
        className="btn-primary mt-5 w-full"
      >
        {sending ? 'Входим…' : 'Принять приглашение'}
      </button>

      <button
        type="button"
        onClick={() => router.replace('/welcome')}
        className="btn-ghost mt-2 w-full"
      >
        Не сейчас
      </button>
    </div>
  );
}
