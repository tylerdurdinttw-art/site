import { prisma } from '@/lib/prisma';
import {
  MODERATION_SETTINGS_KEY,
  normalizeSettings,
  type ModerationSettings,
} from '@/lib/settingsShared';

export type { ModerationSettings } from '@/lib/settingsShared';

/** Настройки модерации из базы. Строки нет — вернутся значения по умолчанию. */
export async function getSettings(): Promise<ModerationSettings> {
  const row = await prisma.panelSetting.findUnique({ where: { key: MODERATION_SETTINGS_KEY } });
  if (!row) return normalizeSettings(null);

  try {
    return normalizeSettings(JSON.parse(row.value));
  } catch {
    // Битое значение — не повод падать: настройки не критичны, отдаём умолчания.
    return normalizeSettings(null);
  }
}

/**
 * Сохраняет присланный кусок настроек поверх текущих: браузер шлёт только ту
 * секцию, которую менял, а нормализация добивает остальное значениями по умолчанию.
 */
export async function saveSettings(patch: unknown): Promise<ModerationSettings> {
  const current = await getSettings();
  const input = (patch ?? {}) as Partial<Record<keyof ModerationSettings, unknown>>;

  const next = normalizeSettings({
    reports: { ...current.reports, ...((input.reports as object) ?? {}) },
    checks: { ...current.checks, ...((input.checks as object) ?? {}) },
    bans: { ...current.bans, ...((input.bans as object) ?? {}) },
  });

  const value = JSON.stringify(next);
  await prisma.panelSetting.upsert({
    where: { key: MODERATION_SETTINGS_KEY },
    create: { key: MODERATION_SETTINGS_KEY, value },
    update: { value },
  });

  return next;
}
