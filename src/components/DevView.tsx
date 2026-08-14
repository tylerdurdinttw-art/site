'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Check, Key, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Row, Section, SettingsPage, Stepper } from '@/components/SettingsControls';
import { MAX_ACCESS_MONTHS, MIN_ACCESS_MONTHS, formatAccessDate } from '@/lib/accessShared';
import { isSteamApiKey, type DevProjectRow, type SteamKeyState } from '@/lib/devShared';
import { APP_NAME } from '@/lib/brand';

/**
 * Раздел «Разработка» — рычаги сайта, а не проекта: ключ Steam Web API и выдача
 * доступа по нику. Видят его только логины из DEVELOPER_LOGINS; страница и все
 * её эндпоинты сверяют это заново, показ пункта в меню ничего не разрешает.
 */

type Notice = { ok: boolean; text: string } | null;

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <div
      className="mt-2 text-[12px] leading-relaxed"
      style={{ color: notice.ok ? 'var(--success)' : 'var(--danger)' }}
    >
      {notice.text}
    </div>
  );
}

/** Ключ Steam Web API. Наружу отдаётся только хвост: само значение остаётся на сервере. */
function SteamKeyCard() {
  const [state, setState] = useState<SteamKeyState | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/dev/steam', { cache: 'no-store' });
        if (!res.ok) throw new Error(`steam: ${res.status}`);
        const body = (await res.json()) as { steam: SteamKeyState };
        setState(body.steam);
      } catch (err) {
        console.error(err);
        setNotice({ ok: false, text: 'Не удалось прочитать состояние ключа.' });
      }
    })();
  }, []);

  const save = async (value: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/dev/steam', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: value }),
      });
      const body = (await res.json()) as { steam?: SteamKeyState; error?: string };
      if (!res.ok || !body.steam) {
        setNotice({ ok: false, text: body.error ?? 'Не удалось сохранить.' });
        return;
      }
      setState(body.steam);
      setKey('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
      setNotice({ ok: false, text: 'Панель не отвечает.' });
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/dev/steam', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: key.trim() }),
      });
      const body = (await res.json()) as { error?: string };
      setNotice(
        res.ok
          ? { ok: true, text: 'Steam ответил — ключ рабочий.' }
          : { ok: false, text: body.error ?? 'Проверка не прошла.' },
      );
    } catch (err) {
      console.error(err);
      setNotice({ ok: false, text: 'Панель не отвечает.' });
    } finally {
      setBusy(false);
    }
  };

  const typed = key.trim();
  const canSave = typed.length > 0 && isSteamApiKey(typed);
  const canCheck = canSave || Boolean(state?.present);

  return (
    <div className="rounded-plate bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <Key size={15} className="shrink-0 text-text-muted" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px]">Ключ Steam Web API</div>
          <div className="mt-0.5 text-[12px] text-text-dim">
            {state === null
              ? 'Читаем…'
              : state.present
                ? `Задан · оканчивается на ${state.hint}${state.fromEnv ? ' · из переменной STEAM_API_KEY' : ''}`
                : 'Не задан — часы в Rust и блокировки VAC/EAC у игроков не показываются'}
          </div>
        </div>
        {busy && <Loader2 size={14} className="shrink-0 animate-spin text-text-muted" />}
        {saved && !busy && (
          <Check size={14} className="shrink-0" style={{ color: 'var(--success)' }} />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="field min-w-[220px] flex-1 font-mono text-[12px]"
          placeholder={state?.present ? 'Новый ключ — 32 символа' : 'Ключ с steamcommunity.com/dev/apikey'}
          value={key}
          disabled={state === null || busy}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setKey(e.target.value);
            setNotice(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) void save(typed);
          }}
        />
        <button
          type="button"
          onClick={() => void save(typed)}
          disabled={!canSave || busy}
          className="btn-ghost shrink-0 px-3 py-2 text-[12px]"
        >
          <Check size={13} />
          Сохранить
        </button>
        <button
          type="button"
          onClick={() => void check()}
          disabled={!canCheck || busy}
          className="btn-ghost shrink-0 px-3 py-2 text-[12px]"
        >
          <ShieldCheck size={13} />
          Проверить
        </button>
        {state?.present && !state.fromEnv && (
          <button
            type="button"
            onClick={() => void save('')}
            disabled={busy}
            className="btn-ghost shrink-0 px-3 py-2 text-[12px]"
            style={{ color: 'var(--danger)' }}
          >
            Стереть
          </button>
        )}
      </div>

      {typed.length > 0 && !canSave && (
        <div className="mt-2 text-[12px] text-text-dim">
          Ключ Steam — 32 символа: цифры и буквы A–F.
        </div>
      )}

      <NoticeLine notice={notice} />
    </div>
  );
}

/** Продление доступа по нику. Срок лежит у проекта — открывается вся его команда. */
function AccessCard({ onDone }: { onDone: (projects: DevProjectRow[]) => void }) {
  const [nick, setNick] = useState('');
  const [months, setMonths] = useState(MIN_ACCESS_MONTHS);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const send = async (action: 'grant' | 'revoke') => {
    const value = nick.trim();
    if (!value) {
      setNotice({ ok: false, text: 'Укажите ник владельца проекта.' });
      return;
    }
    if (action === 'revoke' && !window.confirm(`Закрыть доступ проекту «${value}»?`)) return;

    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/dev/access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nick: value, action, months }),
      });
      const body = (await res.json()) as {
        text?: string;
        error?: string;
        projects?: DevProjectRow[];
      };

      if (!res.ok) {
        setNotice({ ok: false, text: body.error ?? 'Не получилось.' });
        return;
      }

      setNotice({ ok: true, text: body.text ?? 'Готово.' });
      if (body.projects) onDone(body.projects);
    } catch (err) {
      console.error(err);
      setNotice({ ok: false, text: 'Панель не отвечает.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-plate bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <CalendarClock size={15} className="shrink-0 text-text-muted" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px]">Продлить доступ по нику</div>
          <div className="mt-0.5 text-[12px] text-text-dim">
            Логин или почта владельца. Продлевается проект, где он владелец; месяцы прибавляются
            к остатку, а не сжигают его.
          </div>
        </div>
        {busy && <Loader2 size={14} className="shrink-0 animate-spin text-text-muted" />}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="field min-w-[200px] flex-1 text-[12px]"
          placeholder="ник или почта"
          value={nick}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setNick(e.target.value);
            setNotice(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send('grant');
          }}
        />
        <div className="flex shrink-0 items-center gap-2 rounded-control bg-surface-hover px-2 py-1">
          <span className="text-[12px] text-text-dim">мес.</span>
          <Stepper
            label="Месяцев"
            value={months}
            min={MIN_ACCESS_MONTHS}
            max={MAX_ACCESS_MONTHS}
            disabled={busy}
            onChange={setMonths}
          />
        </div>
        <button
          type="button"
          onClick={() => void send('grant')}
          disabled={busy}
          className="btn-ghost shrink-0 px-3 py-2 text-[12px]"
        >
          <CalendarClock size={13} />
          Продлить
        </button>
        <button
          type="button"
          onClick={() => void send('revoke')}
          disabled={busy}
          className="btn-ghost shrink-0 px-3 py-2 text-[12px]"
          style={{ color: 'var(--danger)' }}
        >
          Закрыть доступ
        </button>
      </div>

      <NoticeLine notice={notice} />
    </div>
  );
}

/** Все проекты сайта со сроками — то же, что `npm run access -- list`. */
function ProjectsTable({
  projects,
  loading,
  onRefresh,
}: {
  projects: DevProjectRow[];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-plate bg-surface">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 text-[13px]">
          Проекты сайта{projects.length > 0 ? ` · ${projects.length}` : ''}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Обновить список"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="px-4 pb-4 text-[12px] text-text-dim">
          {loading ? 'Читаем…' : 'Проектов пока нет.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-[12px]">
            <thead>
              <tr className="border-y border-border text-left text-text-dim">
                <th className="px-4 py-2 font-normal">Проект</th>
                <th className="px-4 py-2 font-normal">Владелец</th>
                <th className="px-4 py-2 font-normal">Серверов</th>
                <th className="px-4 py-2 font-normal">Доступ</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2.5">
                    <div className="text-text">{project.name}</div>
                    <div className="font-mono text-[11px] text-text-dim">{project.slug}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-text">{project.owner}</div>
                    {project.ownerEmail && (
                      <div className="text-[11px] text-text-dim">{project.ownerEmail}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-text-muted">
                    {project.serversCount}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      style={{ color: project.active ? 'var(--success)' : 'var(--danger)' }}
                    >
                      {project.expiresAt
                        ? project.active
                          ? `до ${formatAccessDate(project.expiresAt)}`
                          : `истёк ${formatAccessDate(project.expiresAt)}`
                        : 'не выдавался'}
                    </span>
                    {project.active && project.daysLeft !== null && (
                      <span className="text-text-dim"> · дней: {project.daysLeft}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function DevView({ login }: { login: string }) {
  const [projects, setProjects] = useState<DevProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dev/access', { cache: 'no-store' });
      if (!res.ok) throw new Error(`dev access: ${res.status}`);
      const body = (await res.json()) as { projects: DevProjectRow[] };
      setProjects(body.projects);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <SettingsPage
      title="Разработка"
      note={`Служебный раздел ${APP_NAME}: вы вошли как ${login}`}
    >
      <Section title="Steam">
        <SteamKeyCard />
        <Row
          label="Где взять ключ"
          hint="steamcommunity.com/dev/apikey — нужен аккаунт Steam с подтверждённым телефоном"
          control={
            <a
              href="https://steamcommunity.com/dev/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-[12px] font-medium text-accent transition-colors hover:text-accent-hover"
            >
              Открыть
            </a>
          }
        />
      </Section>

      <Section title="Доступ к панели">
        <AccessCard
          onDone={(next) => {
            setProjects(next);
            setLoading(false);
          }}
        />
        <ProjectsTable projects={projects} loading={loading} onRefresh={() => void load()} />
      </Section>
    </SettingsPage>
  );
}
