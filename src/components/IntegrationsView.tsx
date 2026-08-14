'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Send } from 'lucide-react';
import { Row, Section, SettingsPage, Toggle } from '@/components/SettingsControls';
import { APP_NAME } from '@/lib/brand';
import { isDiscordWebhook, type Integrations } from '@/lib/integrationsShared';

/**
 * Раздел «Интеграции». Пока интеграция одна — вебхук Discord, в который уходят
 * репорты игроков. Адрес сохраняется по уходу фокуса, как в остальных настройках.
 */
export default function IntegrationsView() {
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [webhook, setWebhook] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/integrations', { cache: 'no-store' });
        if (!res.ok) throw new Error(`integrations: ${res.status}`);
        const body = (await res.json()) as { integrations: Integrations };
        setIntegrations(body.integrations);
        setWebhook(body.integrations.discord.webhookUrl);
      } catch (err) {
        console.error(err);
        setError('Не удалось загрузить интеграции.');
      }
    })();
  }, []);

  const patch = async (discord: Partial<Integrations['discord']>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/integrations', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ discord }),
      });
      const body = (await res.json()) as { integrations?: Integrations; error?: string };
      if (!res.ok || !body.integrations) {
        setError(body.error ?? 'Не удалось сохранить.');
        return;
      }
      setIntegrations(body.integrations);
      setWebhook(body.integrations.discord.webhookUrl);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
      setError('Панель не отвечает.');
    } finally {
      setSaving(false);
    }
  };

  const saveWebhook = () => {
    const value = webhook.trim();
    if (value === (integrations?.discord.webhookUrl ?? '')) return;
    if (value && !isDiscordWebhook(value)) {
      setError('Это не похоже на вебхук Discord. Скопируйте адрес из настроек канала.');
      return;
    }
    void patch({ webhookUrl: value });
  };

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ webhookUrl: webhook.trim() }),
      });
      const body = (await res.json()) as { error?: string };
      setTestResult(
        res.ok
          ? { ok: true, text: 'Сообщение ушло — проверьте канал.' }
          : { ok: false, text: body.error ?? 'Не доставлено.' },
      );
    } catch (err) {
      console.error(err);
      setTestResult({ ok: false, text: 'Панель не отвечает.' });
    } finally {
      setTesting(false);
    }
  };

  const bound = Boolean(integrations?.discord.webhookUrl);
  const canTest = bound || isDiscordWebhook(webhook.trim());

  return (
    <SettingsPage title="Интеграции" note={`Куда ${APP_NAME} отправляет события проекта`}>
      <Section title="Discord">
        <div className="rounded-plate bg-surface px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px]">Вебхук канала</div>
              <div className="mt-0.5 text-[12px] text-text-dim">
                Настройки канала → Интеграции → Вебхуки → Копировать URL
              </div>
            </div>
            {saving && <Loader2 size={14} className="shrink-0 animate-spin text-text-muted" />}
            {saved && !saving && (
              <Check size={14} className="shrink-0" style={{ color: 'var(--success)' }} />
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              className="field min-w-[220px] flex-1 font-mono text-[12px]"
              placeholder="https://discord.com/api/webhooks/..."
              value={webhook}
              disabled={!integrations}
              onChange={(e) => {
                setWebhook(e.target.value);
                setError(null);
              }}
              onBlur={saveWebhook}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
            <button
              type="button"
              onClick={() => void sendTest()}
              disabled={!canTest || testing}
              className="btn-ghost shrink-0 px-3 py-2 text-[12px]"
            >
              {testing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Отправить тест
            </button>
          </div>

          {testResult && (
            <div
              className="mt-2 text-[12px]"
              style={{ color: testResult.ok ? 'var(--success)' : 'var(--danger)' }}
            >
              {testResult.text}
            </div>
          )}
        </div>

        <Row
          label="Уведомлять о репортах"
          hint="Каждая жалоба игрока уходит в канал отдельным сообщением"
          disabled={!bound}
          control={
            <Toggle
              label="Уведомлять о репортах"
              checked={integrations?.discord.reports ?? true}
              disabled={!bound || saving}
              onChange={(value) => void patch({ reports: value })}
            />
          }
        />
      </Section>

      {error && (
        <div className="text-[12px]" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}
    </SettingsPage>
  );
}
