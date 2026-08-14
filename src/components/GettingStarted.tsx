'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Loader2, Lock, Package, Plus, Trash2 } from 'lucide-react';
import { APP_NAME } from '@/lib/brand';
import { PERMISSIONS } from '@/lib/permissions';
import { membersOnly, type ProjectState, type StaffRow } from '@/lib/projectShared';
import ConnectServerModal from '@/components/ConnectServerModal';

type StepState = 'done' | 'current' | 'locked';

/** Маркер слева от шага: галочка — пройден, спиннер — текущий, замок — закрыт. */
function StepMarker({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <span
        className="flex h-6 w-6 items-center justify-center rounded-md"
        style={{ backgroundColor: 'rgba(34,197,94,0.16)', color: 'var(--success)' }}
      >
        <Check size={14} />
      </span>
    );
  }

  if (state === 'current') {
    return (
      <span className="flex h-6 w-6 items-center justify-center text-accent">
        <Loader2 size={18} className="animate-spin" />
      </span>
    );
  }

  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-text-dim">
      <Lock size={11} />
    </span>
  );
}

function Step({
  state,
  last,
  title,
  description,
  children,
}: {
  state: StepState;
  last: boolean;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  const locked = state === 'locked';

  return (
    <div className="relative flex gap-5 pb-8 last:pb-0">
      {/* Линия цепочки: тянется от маркера к следующему шагу. */}
      {!last && (
        <span className="absolute left-3 top-7 h-[calc(100%-1.75rem)] w-px bg-border" aria-hidden />
      )}

      <div className="relative z-10 shrink-0 bg-bg py-0.5">
        <StepMarker state={state} />
      </div>

      <div
        className={`min-w-0 flex-1 transition-opacity ${locked ? 'select-none opacity-35' : ''}`}
        aria-disabled={locked || undefined}
      >
        <div className={`text-[14px] font-semibold ${locked ? 'blur-[1.5px]' : ''}`}>{title}</div>
        <p
          className={`mt-1 max-w-[640px] text-[13px] leading-relaxed text-text-muted ${
            locked ? 'blur-[1.5px]' : ''
          }`}
        >
          {description}
        </p>
        {!locked && children && <div className="mt-3.5">{children}</div>}
      </div>
    </div>
  );
}

/* ================= шаг 2: приглашение модераторов ================= */

function InviteTeam({
  staff,
  onChanged,
}: {
  staff: StaffRow[];
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invite = async () => {
    if (name.trim().length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), contact: contact.trim() }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? 'Не удалось пригласить.');
        return;
      }
      setName('');
      setContact('');
      onChanged();
    } catch (err) {
      console.error(err);
      setError('Панель не отвечает.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/staff/${id}`, { method: 'DELETE' });
    onChanged();
  };

  return (
    <div className="max-w-[560px] space-y-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void invite();
        }}
      >
        <input
          className="field w-[170px] flex-1"
          placeholder="Ник модератора"
          maxLength={32}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="field w-[170px] flex-1"
          placeholder="Discord или Steam"
          maxLength={64}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
        <button type="submit" disabled={name.trim().length < 2 || busy} className="btn-primary">
          <Plus size={15} />
          Пригласить
        </button>
      </form>

      {error && (
        <div className="text-[12px]" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {staff.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-control border border-border">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center gap-3 bg-surface px-3.5 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[11px] font-semibold text-text-muted">
                {s.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{s.name}</div>
                <div className="truncate text-[11px] text-text-muted">
                  {s.contact || 'контакт не указан'}
                </div>
              </div>
              <span className="shrink-0 text-[11px] text-text-dim">
                {s.acceptedAt ? 'принял' : 'приглашён'}
              </span>
              <button
                type="button"
                onClick={() => void remove(s.id)}
                aria-label={`Убрать ${s.name}`}
                className="shrink-0 text-text-muted transition-colors hover:text-[color:var(--danger)]"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= шаг 3: права ================= */

function GrantPermissions({ staff, onChanged }: { staff: StaffRow[]; onChanged: () => void }) {
  const [saving, setSaving] = useState<string | null>(null);

  const toggle = async (member: StaffRow, key: string) => {
    const next = member.permissions.includes(key)
      ? member.permissions.filter((p) => p !== key)
      : [...member.permissions, key];

    setSaving(member.id);
    try {
      await fetch(`/api/staff/${member.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ permissions: next }),
      });
      onChanged();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="max-w-[720px] space-y-3">
      {staff.map((member) => (
        <div key={member.id} className="rounded-control border border-border bg-surface p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[11px] font-semibold text-text-muted">
              {member.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="text-[13px] font-medium">{member.name}</span>
            {saving === member.id && <Loader2 size={13} className="animate-spin text-text-muted" />}
            <span className="ml-auto text-[11px] text-text-dim">
              {member.permissions.length} из {PERMISSIONS.length}
            </span>
          </div>

          <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {PERMISSIONS.map((permission) => {
              const on = member.permissions.includes(permission.key);
              return (
                <label
                  key={permission.key}
                  title={permission.hint}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-control border px-3 py-2 text-[13px] transition-colors ${
                    on
                      ? 'border-[color:var(--accent)] bg-[rgba(59,130,246,0.1)]'
                      : 'border-border bg-surface-hover hover:bg-surface-raised'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => void toggle(member, permission.key)}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      on ? 'border-transparent bg-accent text-white' : 'border-border-strong'
                    }`}
                  >
                    {on && <Check size={11} />}
                  </span>
                  <span className="truncate">{permission.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================= страница ================= */

export default function GettingStarted({ initial }: { initial: ProjectState }) {
  const router = useRouter();
  const [project, setProject] = useState(initial);
  const [connectOpen, setConnectOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/project', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { project: ProjectState | null };
      if (data.project) setProject(data.project);
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Владелец в цепочку не входит: он уже в проекте и права у него полные,
  // иначе второй и третий шаги считались бы пройденными сразу после регистрации.
  const members = useMemo(() => membersOnly(project.staff), [project.staff]);

  // Шаги считаются по фактическому состоянию проекта, а не по счётчику в базе.
  const done = useMemo(
    () => [
      project.serversCount > 0,
      members.length > 0,
      members.some((s) => s.permissions.length > 0),
    ],
    [project.serversCount, members],
  );

  // Пройденный шаг фиксируем в базе — по нему видно, где пользователь остановился.
  useEffect(() => {
    const reached = done.filter(Boolean).length;
    if (reached <= project.step) return;
    void fetch('/api/project', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ step: reached }),
    });
  }, [done, project.step]);

  const stateOf = (index: number): StepState => {
    if (done[index]) return 'done';
    // Открыт первый невыполненный шаг, всё после него закрыто.
    const firstOpen = done.findIndex((v) => !v);
    return index === firstOpen ? 'current' : 'locked';
  };

  const allDone = done.every(Boolean);

  const finish = async () => {
    setFinishing(true);
    try {
      await fetch('/api/project', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ done: true }),
      });
      router.replace('/players');
      router.refresh();
    } catch (err) {
      console.error(err);
      setFinishing(false);
    }
  };

  return (
    <div className="mx-auto max-w-[860px] px-8 py-12">
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-plate border border-border bg-surface">
          <Package size={20} className="text-text-muted" />
        </span>
        <div>
          <h1 className="text-[16px] font-semibold leading-tight">Начало работы</h1>
          <p className="text-[13px] text-text-muted">Давайте настроим ваш проект в {APP_NAME}</p>
        </div>
      </div>

      <div className="mt-9">
        <Step
          state={stateOf(0)}
          last={false}
          title="Подключите ваш сервер"
          description={`Для начала работы вам в первую очередь необходимо подключить ваш сервер к ${APP_NAME}.`}
        >
          {done[0] ? (
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-text-muted">
                Подключено серверов: {project.serversCount}
              </span>
              <button type="button" onClick={() => setConnectOpen(true)} className="btn-ghost">
                Подключить ещё
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConnectOpen(true)} className="btn-primary">
              Подключить сервер
            </button>
          )}
        </Step>

        <Step
          state={stateOf(1)}
          last={false}
          title="Пригласите команду"
          description="Пригласите модераторов вашего проекта — они появятся в разделе «Сотрудники» и смогут работать вместе с вами."
        >
          <InviteTeam staff={members} onChanged={() => void reload()} />
        </Step>

        <Step
          state={stateOf(2)}
          last={false}
          title="Выдайте права"
          description="Отметьте, что разрешено каждому модератору: проверки, баны, разбаны, муты и остальное. Права можно менять в любой момент."
        >
          <GrantPermissions staff={members} onChanged={() => void reload()} />
        </Step>

        <Step
          state={allDone ? 'current' : 'locked'}
          last
          title="Начните работу"
          description="Всё готово. Открываем панель — начнём со списка игроков."
        >
          <button type="button" onClick={() => void finish()} disabled={finishing} className="btn-primary">
            {finishing ? 'Открываем…' : 'Начать работу'}
            <ArrowRight size={15} />
          </button>
        </Step>
      </div>

      {connectOpen && (
        <ConnectServerModal
          projectName={project.name}
          hasLogo={project.hasLogo}
          onClose={() => setConnectOpen(false)}
          onPaired={() => void reload()}
        />
      )}
    </div>
  );
}
