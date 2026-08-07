/** Общая часть раздела «Репорты»: без Prisma, файл попадает в клиентский бандл. */

import type { PlayerStatus } from '@/lib/types';

/** Строка раздела «Репорты» — игрок, на которого жаловались. */
export interface ReportedPlayer {
  steamId: string;
  name: string;
  status: PlayerStatus;
  avatarUrl: string | null;
  serverName: string;
  /** Сколько жалоб на игрока лежит в базе с учётом срока хранения. */
  reportsCount: number;
  /** Причина последней жалобы; null — жалоба пришла без темы. */
  lastReason: string | null;
  /** Кто пожаловался последним. */
  lastReporterName: string | null;
  lastReportAt: string; // ISO
  /** Идёт ли по игроку проверка прямо сейчас. */
  checkActive: boolean;
  /** Действует ли на игрока бан прямо сейчас. */
  bannedNow: boolean;
}
