'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Plug } from 'lucide-react';
import { Section, SettingsPage } from '@/components/SettingsControls';
import { APP_NAME } from '@/lib/brand';

/**
 * Раздел «Интеграции».
 *
 * Вебхуки Discord живут в конфиге плагина, а не здесь: сообщения уходят прямо
 * с игрового сервера, минуя панель. Так уведомления работают и там, где у самой
 * панели нет доступа к discord.com — а это ровно тот случай, ради которого всё
 * и переносилось. Хранить адрес в панели, чтобы потом отдавать его плагину,
 * смысла нет: он всё равно нужен на игровом сервере.
 */

const CONFIG_PATH = 'oxide/config/QuickPanelBridge.json';

const SNIPPET = `"Discord": {
  "BansWebhook": "https://discord.com/api/webhooks/...",
  "ReportsWebhook": "https://discord.com/api/webhooks/...",
  "NotifyBans": true,
  "NotifyUnbans": true,
  "NotifyReports": true,
  "NotifyChecks": true,
  "ServerName": "",
  "PanelUrl": "https://quickrust.online",
  "MentionEveryoneFrom": 2,
  "ReportCountWindowHours": 24,
  "ShowAvatars": true
}`;

/** Кнопка «скопировать» у блока кода. */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label="Скопировать"
      className="btn-ghost shrink-0 px-2.5 py-1.5 text-[12px]"
    >
      {done ? <Check size={13} style={{ color: 'var(--success)' }} /> : <Copy size={13} />}
      {done ? 'Скопировано' : 'Копировать'}
    </button>
  );
}

function CodeBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-control border border-border bg-bg-sidebar">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-dim">{label}</span>
        <CopyButton text={text} />
      </div>
      <pre className="overflow-x-auto scrollbar-thin px-3 py-2.5 font-mono text-[11px] leading-relaxed text-text-muted">
        {text}
      </pre>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-plate bg-surface px-4 py-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[11px] font-semibold text-text-muted">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px]">{title}</div>
        {children && <div className="mt-2">{children}</div>}
      </div>
    </div>
  );
}

interface KeyState {
  enabled: boolean;
  issuedAt: string | null;
}

/** Бан-лист наружу: ключ API, по которому сайт проекта читает баны. */
function BanlistApiSection() {
  const [state, setState] = useState<KeyState | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('https://panel.example');

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch('/api/integrations/banlist-key', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: KeyState) => setState(data))
      .catch(() => setError('Не удалось загрузить состояние ключа.'));
  }, []);

  const call = async (method: 'POST' | 'DELETE') => {
    if (method === 'POST' && state?.enabled
      && !window.confirm('Старый ключ перестанет работать сразу. Перевыпустить?')) return;
    if (method === 'DELETE'
      && !window.confirm('Сайт потеряет доступ к бан-листу. Отключить API?')) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/integrations/banlist-key', { method });
      const data = (await res.json()) as KeyState & { key?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Ошибка');
      setState({ enabled: data.enabled, issuedAt: data.issuedAt });
      setKey(data.key ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const shownKey = key ?? 'ВАШ_КЛЮЧ';
  const example = `curl -H "Authorization: Bearer ${shownKey}" \
  "${origin}/api/public/bans?status=active&page=1&limit=50"`;

  return (
    <Section title="API бан-листа">
      <div className="flex gap-3 rounded-plate bg-surface px-4 py-3">
        <KeyRound size={15} className="mt-0.5 shrink-0" style={{ color: '#a78bfa' }} />
        <p className="text-[13px] leading-relaxed text-text-muted">
          Подключите сайт проекта к бан-листу: по ключу он получает баны только на чтение.
          IP игроков через API не отдаются. Ключ показывается один раз — сохраните его
          в конфиге сайта.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-plate bg-surface px-4 py-3">
        <div className="min-w-0 flex-1 text-[13px]">
          {state === null
            ? 'Загрузка…'
            : state.enabled
              ? `Ключ выпущен ${new Date(state.issuedAt ?? '').toLocaleString('ru-RU')}`
              : 'API выключен — ключа нет'}
        </div>
        <button
          type="button"
          disabled={busy || state === null}
          onClick={() => void call('POST')}
          className="btn-primary px-3 py-1.5 text-[12px]"
        >
          {state?.enabled ? 'Перевыпустить ключ' : 'Выпустить ключ'}
        </button>
        {state?.enabled && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void call('DELETE')}
            className="btn-ghost px-3 py-1.5 text-[12px]"
          >
            Отключить
          </button>
        )}
      </div>

      {error && <p className="px-1 text-[12px]" style={{ color: 'var(--danger)' }}>{error}</p>}

      {key && (
        <div className="rounded-plate bg-surface px-4 py-3">
          <p className="mb-2 text-[12px] text-text-dim">
            Новый ключ. После перезагрузки страницы его уже не увидеть.
          </p>
          <CodeBlock label="API-ключ" text={key} />
        </div>
      )}

      <div className="overflow-hidden rounded-plate bg-surface">
        <table className="w-full border-collapse text-[12px]">
          <tbody>
            {[
              [
                'GET /api/public/bans',
                'Список банов. status=active|lifted|all, search (ник, SteamID, причина), '
                  + 'server, since (ISO или unix — изменённые после), page, limit ≤ 100',
              ],
              ['GET /api/public/bans/<steamId>', 'Забанен ли игрок сейчас и вся его история банов'],
              ['GET /api/public/bans/stats', 'Сколько банов всего и активных, список серверов'],
            ].map(([route, what]) => (
              <tr key={route} className="border-b border-border last:border-b-0">
                <td className="whitespace-nowrap px-4 py-2.5 align-top font-mono text-[11px] text-text-muted">
                  {route}
                </td>
                <td className="px-4 py-2.5 text-text-muted">{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pt-1">
        <CodeBlock label="Пример запроса" text={example} />
      </div>
      <p className="px-1 pt-1 text-[12px] leading-relaxed text-text-dim">
        Ключ передаётся заголовком <span className="font-mono">Authorization: Bearer</span>,{' '}
        <span className="font-mono">X-Api-Key</span> или параметром{' '}
        <span className="font-mono">?key=</span>. Лимит — 120 запросов в минуту. Лучше звать API
        с бэкенда сайта: запрос из браузера покажет ключ любому посетителю.
      </p>
    </Section>
  );
}

export default function IntegrationsView() {
  return (
    <SettingsPage
      title="Интеграции"
      note={`Куда ${APP_NAME} отправляет события проекта и откуда сайт берёт бан-лист`}
    >
      <Section title="Discord">
        <div className="flex gap-3 rounded-plate bg-surface px-4 py-3">
          <Plug size={15} className="mt-0.5 shrink-0" style={{ color: '#a78bfa' }} />
          <p className="text-[13px] leading-relaxed text-text-muted">
            Сообщения в Discord отправляет плагин — прямо с игрового сервера, минуя панель.
            Поэтому и адреса вебхуков указываются в его конфиге: они нужны там, где уходит
            запрос. Уведомления работают, даже если у самой панели нет доступа к discord.com.
          </p>
        </div>

        <Step n={1} title="Создайте вебхуки в Discord">
          <p className="text-[12px] leading-relaxed text-text-dim">
            Настройки канала → Интеграции → Вебхуки → Создать вебхук → Копировать URL.
            Каналов удобно завести два: бан-лист смотрит администрация, репорты читают модераторы.
          </p>
        </Step>

        <Step n={2} title="Впишите адреса в конфиг плагина">
          <p className="mb-2 text-[12px] leading-relaxed text-text-dim">
            Файл <span className="font-mono text-text-muted">{CONFIG_PATH}</span> на игровом
            сервере, секция <span className="font-mono text-text-muted">Discord</span>. Пустая
            строка — канал выключен.
          </p>
          <CodeBlock label={CONFIG_PATH} text={SNIPPET} />
        </Step>

        <Step n={3} title="Перезагрузите плагин">
          <p className="text-[12px] leading-relaxed text-text-dim">
            В консоли сервера: <span className="font-mono text-text-muted">oxide.reload QuickPanelBridge</span>.
            Первый же бан или репорт уйдёт в канал. Если что-то не так, плагин напишет
            причину в консоль — например, что с сервера не открывается discord.com.
          </p>
        </Step>
      </Section>

      <Section title="Что уходит в каналы">
        <div className="overflow-hidden rounded-plate bg-surface">
          <table className="w-full border-collapse text-[12px]">
            <tbody>
              {[
                [
                  'BansWebhook',
                  'Новая блокировка: кто выдал, игрок (со ссылкой на профиль и аватаркой), '
                    + 'причина и дата разбана',
                ],
                ['BansWebhook', 'Снятие блокировки: кто снял и с кого'],
                [
                  'ReportsWebhook',
                  'Жалоба игрока: на кого (ник ведёт в его карточку в панели), какая она по счёту, '
                    + 'причина, комментарий и от кого',
                ],
                [
                  'ReportsWebhook',
                  'Начало проверки: кто из сотрудников вызвал игрока и кого именно — '
                    + 'проверки обычно и начинаются с жалоб, поэтому канал тот же',
                ],
              ].map(([key, what], i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-2.5 align-top font-mono text-[11px] text-text-muted">
                    {key}
                  </td>
                  <td className="px-4 py-2.5 text-text-muted">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-1 pt-1 text-[12px] leading-relaxed text-text-dim">
          Выключить любое из четырёх можно флагами{' '}
          <span className="font-mono">NotifyBans</span>,{' '}
          <span className="font-mono">NotifyUnbans</span>,{' '}
          <span className="font-mono">NotifyReports</span> и{' '}
          <span className="font-mono">NotifyChecks</span>, не стирая адрес.
        </p>
        <p className="px-1 pt-1 text-[12px] leading-relaxed text-text-dim">
          Со второй жалобы на одного и того же игрока сообщение уходит с{' '}
          <span className="font-mono">@everyone</span>: порог задаёт{' '}
          <span className="font-mono">MentionEveryoneFrom</span>, а{' '}
          <span className="font-mono">0</span> убирает упоминание совсем.
        </p>
      </Section>

      <BanlistApiSection />
    </SettingsPage>
  );
}
