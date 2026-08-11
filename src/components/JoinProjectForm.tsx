'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

/**
 * Вход в чужой проект по коду приглашения. Код выдаёт владелец в разделе
 * «Сотрудники» — там же лежит и ссылка вида /invite/<код>.
 */
export default function JoinProjectForm({ onBack }: { onBack?: () => void }) {
  const router = useRouter();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = useCallback(async () => {
    const value = code.trim();
    if (!value || sending) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch('/api/project/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: value }),
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

  return (
    <div className="w-full max-w-[350px]">
      <h1 className="text-[19px] font-semibold leading-tight">Подключиться к проекту</h1>
      <p className="mt-1 text-[13px] text-text-muted">
        Введите код приглашения, который вам выдал владелец проекта.
      </p>

      <form
        className="mt-7 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <label htmlFor="invite-code" className="text-[12px] text-text-muted">
            Код приглашения
          </label>
          <input
            id="invite-code"
            className="field mt-1.5 font-mono"
            placeholder="QK3nR8xTm2vL"
            maxLength={64}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoFocus
          />
        </div>

        {error && (
          <div
            className="rounded-control px-3 py-2 text-[12px]"
            style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }}
          >
            {error}
          </div>
        )}

        <div className="flex items-stretch gap-2 pt-1">
          <button
            type="button"
            onClick={() => (onBack ? onBack() : router.back())}
            aria-label="Назад"
            className="btn-ghost w-11 shrink-0 px-0"
          >
            <ArrowLeft size={16} />
          </button>
          <button type="submit" disabled={!code.trim() || sending} className="btn-primary flex-1">
            {sending ? 'Входим…' : 'Войти в проект'}
          </button>
        </div>
      </form>

      <p className="mt-5 text-[12px] leading-relaxed text-text-muted">
        Кода нет? Попросите владельца проекта скопировать ссылку приглашения в разделе
        «Сотрудники» — она откроет тот же экран за вас.
      </p>
    </div>
  );
}
