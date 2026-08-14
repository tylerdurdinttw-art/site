'use client';

import { useState } from 'react';
import { Check, Copy, Plug } from 'lucide-react';
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

const CONFIG_PATH = 'oxide/config/YnaziCotTvBridge.json';

const SNIPPET = `"Discord": {
  "BansWebhook": "https://discord.com/api/webhooks/...",
  "ReportsWebhook": "https://discord.com/api/webhooks/...",
  "NotifyBans": true,
  "NotifyUnbans": true,
  "NotifyReports": true,
  "ServerName": ""
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

export default function IntegrationsView() {
  return (
    <SettingsPage
      title="Интеграции"
      note={`Куда ${APP_NAME} отправляет события проекта`}
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
          <div className="rounded-control border border-border bg-bg-sidebar">
            <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-dim">
                {CONFIG_PATH}
              </span>
              <CopyButton text={SNIPPET} />
            </div>
            <pre className="overflow-x-auto scrollbar-thin px-3 py-2.5 font-mono text-[11px] leading-relaxed text-text-muted">
              {SNIPPET}
            </pre>
          </div>
        </Step>

        <Step n={3} title="Перезагрузите плагин">
          <p className="text-[12px] leading-relaxed text-text-dim">
            В консоли сервера: <span className="font-mono text-text-muted">oxide.reload YnaziCotTvBridge</span>.
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
                ['BansWebhook', 'Новая блокировка: игрок, сервер, причина и кто выдал — панель или консоль сервера'],
                ['BansWebhook', 'Снятие блокировки: игрок и сервер'],
                ['ReportsWebhook', 'Жалоба игрока: на кого, от кого, причина и комментарий'],
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
          Выключить любое из трёх можно флагами{' '}
          <span className="font-mono">NotifyBans</span>,{' '}
          <span className="font-mono">NotifyUnbans</span> и{' '}
          <span className="font-mono">NotifyReports</span>, не стирая адрес.
        </p>
      </Section>
    </SettingsPage>
  );
}
