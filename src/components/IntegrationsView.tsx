'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Send } from 'lucide-react';
import { Row, Section, SettingsPage, Toggle } from '@/components/SettingsControls';
import { APP_NAME } from '@/lib/brand';
import {
  DISCORD_CHANNELS,
  isDiscordWebhook,
  type DiscordChannel,
  type DiscordChannelKey,
  type Integrations,
} from '@/lib/integrationsShared';

/**
 * Раздел «Интеграции». Каналов Discord два — бан-лист и репорты: их обычно
 * разводят по разным каналам сервера, поэтому вебхук у каждого свой.
 * Адрес сохраняется по уходу фокуса, как в остальных настройках.
 */
export default function IntegrationsView() {
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  /** Черновики полей: пока фокус в поле, значение живёт здесь, а не в настройках. */
  const [drafts, setDrafts] = useState<Record<DiscordChannelKey, string>>({
    bans: '',
    reports: '',
  });
  const [saving, setSaving] = useState<DiscordChannelKey | null>(null);
  const [saved, setSaved] = useState<DiscordChannelKey | null>(null);
  const [testing, setTesting] = useState<DiscordChannelKey | null>(null);
  const [results, setResults] = useState<
    Partial<Record<DiscordChannelKey, { ok: boolean; text: string }>>
  >({});
  const [error, setError] = useState<string | null>(null);

  const apply = (next: Integrations) => {
    setIntegrations(next);
    setDrafts({ bans: next.discord.bans.webhookUrl, reports: next.discord.reports.webhookUrl });
  };

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/integrations', { cache: 'no-store' });
        const body = (await res.json()) as { integrations?: Integrations; error?: string };
        if (!res.ok || !body.integrations) {
          // Причину показываем как есть: чаще всего это «Недостаточно прав» у сотрудника
          // без права «Настройки», и общее «не удалось» только путает.
          setError(body.error ?? `Не удалось загрузить интеграции (${res.status}).`);
          return;
        }
        apply(body.integrations);
      } catch (err) {
        console.error(err);
        setError('Не удалось загрузить интеграции: панель не отвечает.');
      }
    })();
  }, []);

  const patch = async (channel: DiscordChannelKey, value: Partial<DiscordChannel>) => {
    setSaving(channel);
    setError(null);
    try {
      const res = await fetch('/api/integrations', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ discord: { [channel]: value } }),
      });
      const body = (await res.json()) as { integrations?: Integrations; error?: string };
      if (!res.ok || !body.integrations) {
        setError(body.error ?? 'Не удалось сохранить.');
        return;
      }
      apply(body.integrations);
      setSaved(channel);
      setTimeout(() => setSaved((current) => (current === channel ? null : current)), 2000);
    } catch (err) {
      console.error(err);
      setError('Панель не отвечает.');
    } finally {
      setSaving(null);
    }
  };

  const saveWebhook = (channel: DiscordChannelKey) => {
    const value = drafts[channel].trim();
    if (value === (integrations?.discord[channel].webhookUrl ?? '')) return;
    if (value && !isDiscordWebhook(value)) {
      setError('Это не похоже на вебхук Discord. Скопируйте адрес из настроек канала.');
      return;
    }
    void patch(channel, { webhookUrl: value });
  };

  const sendTest = async (channel: DiscordChannelKey) => {
    setTesting(channel);
    setResults((current) => ({ ...current, [channel]: undefined }));
    try {
      const res = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel, webhookUrl: drafts[channel].trim() }),
      });
      const body = (await res.json()) as { error?: string };
      setResults((current) => ({
        ...current,
        [channel]: res.ok
          ? { ok: true, text: 'Сообщение ушло — проверьте канал.' }
          : { ok: false, text: body.error ?? 'Не доставлено.' },
      }));
    } catch (err) {
      console.error(err);
      setResults((current) => ({ ...current, [channel]: { ok: false, text: 'Панель не отвечает.' } }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <SettingsPage title="Интеграции" note={`Куда ${APP_NAME} отправляет события проекта`}>
      {DISCORD_CHANNELS.map(({ key, title, toggle, hint }) => {
        const bound = Boolean(integrations?.discord[key].webhookUrl);
        const canTest = bound || isDiscordWebhook(drafts[key].trim());
        const result = results[key];

        return (
          <Section key={key} title={`Discord · ${title}`}>
            <div className="rounded-plate bg-surface px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px]">Вебхук канала</div>
                  <div className="mt-0.5 text-[12px] text-text-dim">
                    Настройки канала → Интеграции → Вебхуки → Копировать URL
                  </div>
                </div>
                {saving === key && (
                  <Loader2 size={14} className="shrink-0 animate-spin text-text-muted" />
                )}
                {saved === key && saving !== key && (
                  <Check size={14} className="shrink-0" style={{ color: 'var(--success)' }} />
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  className="field min-w-[220px] flex-1 font-mono text-[12px]"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={drafts[key]}
                  disabled={!integrations}
                  onChange={(e) => {
                    const { value } = e.target;
                    setDrafts((current) => ({ ...current, [key]: value }));
                    setError(null);
                  }}
                  onBlur={() => saveWebhook(key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
                <button
                  type="button"
                  onClick={() => void sendTest(key)}
                  disabled={!canTest || testing === key}
                  className="btn-ghost shrink-0 px-3 py-2 text-[12px]"
                >
                  {testing === key ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Send size={13} />
                  )}
                  Отправить тест
                </button>
              </div>

              {result && (
                <div
                  className="mt-2 text-[12px]"
                  style={{ color: result.ok ? 'var(--success)' : 'var(--danger)' }}
                >
                  {result.text}
                </div>
              )}
            </div>

            <Row
              label={toggle}
              hint={hint}
              disabled={!bound}
              control={
                <Toggle
                  label={toggle}
                  checked={integrations?.discord[key].enabled ?? true}
                  disabled={!bound || saving === key}
                  onChange={(enabled) => void patch(key, { enabled })}
                />
              }
            />
          </Section>
        );
      })}

      {error && (
        <div className="text-[12px]" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}
    </SettingsPage>
  );
}
