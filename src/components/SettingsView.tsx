'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ActionRow,
  Row,
  Section,
  Select,
  SettingsPage,
  SettingsTabs,
  Stepper,
  TagInput,
  Toggle,
} from '@/components/SettingsControls';
import {
  BAN_INTERVAL_MAX,
  BAN_LIMIT_MAX,
  DELETE_AFTER_OPTIONS,
  IGNORE_AFTER_CHECK_OPTIONS,
  MAX_REASON_ITEMS,
  MAX_REASON_LENGTH,
  MIN_REPORTS_MAX,
  SETTINGS_TABS,
  type BanSettings,
  type CheckSettings,
  type ModerationSettings,
  type ReportSettings,
  type SettingsTab,
} from '@/lib/settingsShared';

/** Изменения уходят на сервер сразу: настройки мелкие, кнопки «Сохранить» тут нет. */
export default function SettingsView() {
  const [settings, setSettings] = useState<ModerationSettings | null>(null);
  const [tab, setTab] = useState<SettingsTab>('reports');
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/settings', { cache: 'no-store' });
        if (!res.ok) throw new Error(`settings: ${res.status}`);
        const body = (await res.json()) as { settings: ModerationSettings };
        setSettings(body.settings);
      } catch (err) {
        console.error(err);
        setError('Не удалось загрузить настройки.');
      }
    })();
  }, []);

  const patch = useCallback(
    async (section: keyof ModerationSettings, values: Record<string, unknown>) => {
      // Оптимистично: элемент управления не должен ждать ответа сервера.
      setSettings((prev) =>
        prev ? { ...prev, [section]: { ...prev[section], ...values } } : prev,
      );
      setError(null);

      try {
        const res = await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ [section]: values }),
        });
        if (!res.ok) throw new Error(`settings: ${res.status}`);
        const body = (await res.json()) as { settings: ModerationSettings };
        setSettings(body.settings);
      } catch (err) {
        console.error(err);
        setError('Настройка не сохранилась — панель недоступна.');
      }
    },
    [],
  );

  const setReports = (values: Partial<ReportSettings>) => void patch('reports', values);
  const setChecks = (values: Partial<CheckSettings>) => void patch('checks', values);
  const setBans = (values: Partial<BanSettings>) => void patch('bans', values);

  const clearReports = useCallback(async () => {
    setClearing(true);
    setError(null);
    try {
      const res = await fetch('/api/reports', { method: 'DELETE' });
      if (!res.ok) throw new Error(`reports: ${res.status}`);
      const body = (await res.json()) as { deleted: number };
      setCleared(body.deleted);
      setConfirmClear(false);
    } catch (err) {
      console.error(err);
      setError('Репорты не удалились — панель недоступна.');
    } finally {
      setClearing(false);
    }
  }, []);

  return (
    <SettingsPage
      title="Настройки"
      note="Основные параметры сервиса модерации"
      tabs={<SettingsTabs tabs={SETTINGS_TABS} active={tab} onChange={setTab} />}
    >
      {error && (
        <div
          className="rounded-plate px-4 py-3 text-[13px]"
          style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }}
        >
          {error}
        </div>
      )}

      {!settings && (
        <div className="space-y-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[52px] animate-pulse rounded-plate bg-surface" />
          ))}
        </div>
      )}

      {settings && tab === 'reports' && (
        <>
          <Section title="Общее">
            <Row
              label="Удалять репорты после блокировки"
              hint="если игрок будет заблокирован, все репорты на него будут удалены"
              control={
                <Toggle
                  label="Удалять репорты после блокировки"
                  checked={settings.reports.deleteAfterBan}
                  onChange={(deleteAfterBan) => setReports({ deleteAfterBan })}
                />
              }
            />
            <Row
              label="Удалять репорты после проверки"
              hint="по завершении проверки все репорты на игрока будут удалены"
              control={
                <Toggle
                  label="Удалять репорты после проверки"
                  checked={settings.reports.deleteAfterCheck}
                  onChange={(deleteAfterCheck) => setReports({ deleteAfterCheck })}
                />
              }
            />
            <Row
              label="Удалять репорты спустя время"
              hint="репорты, полученные более заданного периода будут автоматически удаляться"
              control={
                <Select
                  label="Удалять репорты спустя время"
                  value={settings.reports.deleteAfterDays}
                  options={DELETE_AFTER_OPTIONS}
                  onChange={(deleteAfterDays) => setReports({ deleteAfterDays })}
                />
              }
            />
            <Row
              label="Игнорировать репорты после проверки"
              hint="репорты, полученные на проверенного игрока не будут отображаться"
              control={
                <Select
                  label="Игнорировать репорты после проверки"
                  value={settings.reports.ignoreAfterCheckHours}
                  options={IGNORE_AFTER_CHECK_OPTIONS}
                  onChange={(ignoreAfterCheckHours) => setReports({ ignoreAfterCheckHours })}
                />
              }
            />
          </Section>

          <Section title="Список репортов">
            <ActionRow
              label="Удалить все репорты"
              hint="все полученные на игроков репорты будут удалены"
              tone="danger"
              onClick={() => {
                setCleared(null);
                setConfirmClear(true);
              }}
            />
            {cleared !== null && (
              <div className="px-4 pt-2 text-[12px]" style={{ color: 'var(--success)' }}>
                Удалено репортов: {cleared}.
              </div>
            )}
          </Section>
        </>
      )}

      {settings && tab === 'checks' && (
        <Section title="Общее">
          <Row
            label="Минимальное кол-во жалоб для начала проверки"
            hint={`не позволяет начать проверку, если у игрока меньше ${settings.checks.minReports} жалоб`}
            control={
              <Stepper
                label="Минимальное кол-во жалоб"
                value={settings.checks.minReports}
                min={0}
                max={MIN_REPORTS_MAX}
                onChange={(minReports) => setChecks({ minReports })}
              />
            }
          />
          <Row
            label="Оповещение о начале проверки игрока в чате"
            hint="все игроки на сервере увидят, что игрок вызван на проверку"
            control={
              <Toggle
                label="Оповещение о начале проверки"
                checked={settings.checks.announceStart}
                onChange={(announceStart) => setChecks({ announceStart })}
              />
            }
          />
          <Row
            label="Оповещение в чате о завершении проверки"
            hint="если нарушений не обнаружено, все игроки увидят оповещение в чате"
            control={
              <Toggle
                label="Оповещение о завершении проверки"
                checked={settings.checks.announceFinish}
                onChange={(announceFinish) => setChecks({ announceFinish })}
              />
            }
          />
          <Row
            label="Оповещать игроков отправивших репорт"
            hint="уведомим всех, кто жаловался на игрока, о результате проверки подозреваемого"
            control={
              <Toggle
                label="Оповещать игроков отправивших репорт"
                checked={settings.checks.notifyReporters}
                onChange={(notifyReporters) => setChecks({ notifyReporters })}
              />
            }
          />
        </Section>
      )}

      {settings && tab === 'bans' && (
        <>
          <Section title="Общее">
            <Row
              label="Отправлять оповещение о бане игрока в чат"
              hint="в чате на сервере появится сообщение о бане игрока"
              control={
                <Toggle
                  label="Оповещение о бане в чат"
                  checked={settings.bans.announceInChat}
                  onChange={(announceInChat) => setBans({ announceInChat })}
                />
              }
            />
            <Row
              label="Ограничение на количество блокировок за определённый период"
              hint="сотрудник не сможет выдать больше блокировок, чем установлено лимитом"
              control={
                <Toggle
                  label="Ограничение на количество блокировок"
                  checked={settings.bans.limitEnabled}
                  onChange={(limitEnabled) => setBans({ limitEnabled })}
                />
              }
            />
            <Row
              label="Количество блокировок"
              hint="сотрудник не сможет выдать больше блокировок, чем указано"
              disabled={!settings.bans.limitEnabled}
              control={
                <Stepper
                  label="Количество блокировок"
                  value={settings.bans.limitCount}
                  min={1}
                  max={BAN_LIMIT_MAX}
                  disabled={!settings.bans.limitEnabled}
                  onChange={(limitCount) => setBans({ limitCount })}
                />
              }
            />
            <Row
              label="Интервал в минутах"
              hint="промежуток времени, в течение которого учитываются блокировки"
              disabled={!settings.bans.limitEnabled}
              control={
                <Stepper
                  label="Интервал в минутах"
                  value={settings.bans.limitIntervalMin}
                  min={1}
                  max={BAN_INTERVAL_MAX}
                  disabled={!settings.bans.limitEnabled}
                  onChange={(limitIntervalMin) => setBans({ limitIntervalMin })}
                />
              }
            />
          </Section>

          <Section title="Причины">
            <div className="space-y-4 rounded-plate bg-surface p-4">
              <TagInput
                label="Причины для блокировок"
                hint="из этого списка выбирают причину, когда банят игрока"
                values={settings.bans.banReasons}
                maxItems={MAX_REASON_ITEMS}
                maxLength={MAX_REASON_LENGTH}
                onChange={(banReasons) => setBans({ banReasons })}
              />
              <TagInput
                label="Причины для блокировки команды"
                hint="причины, с которыми блокируется вся команда игрока"
                values={settings.bans.teamBanReasons}
                maxItems={MAX_REASON_ITEMS}
                maxLength={MAX_REASON_LENGTH}
                onChange={(teamBanReasons) => setBans({ teamBanReasons })}
              />
              <TagInput
                label="Вердикты проверок"
                hint="из этого списка выбирают итог, когда завершают проверку"
                values={settings.bans.checkVerdicts}
                maxItems={MAX_REASON_ITEMS}
                maxLength={MAX_REASON_LENGTH}
                onChange={(checkVerdicts) => setBans({ checkVerdicts })}
              />
            </div>
          </Section>
        </>
      )}

      {confirmClear && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(4,4,6,0.72)' }}
          onClick={() => setConfirmClear(false)}
          role="presentation"
        >
          <div
            className="card w-full max-w-[420px] p-5"
            role="dialog"
            aria-modal="true"
            aria-label="Удалить все репорты"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-semibold">Удалить все репорты?</div>
            <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
              Из базы панели пропадут все жалобы на игроков, а счётчики репортов обнулятся.
              Действие необратимо.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="btn-ghost py-2"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={clearing}
                onClick={() => void clearReports()}
                className="rounded-control px-4 py-2 text-[13px] font-medium text-white transition-opacity disabled:opacity-50"
                style={{ backgroundColor: 'var(--danger)' }}
              >
                {clearing ? 'Удаляем…' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SettingsPage>
  );
}
