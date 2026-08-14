export type ClientType = 'licensed' | 'pirate';
export type PlayerStatus = 'online' | 'sleeping' | 'offline';

export interface Player {
  steamId: string; // "76561198403377516"
  name: string;
  clientType: ClientType;
  serverId: string;
  serverName: string; // "Rust #1 [ X1000000 | NOLIMIT ]"
  status: PlayerStatus;
  ip: string;
  ping: number; // ms
  isp: string | null;
  city: string | null;
  country: string | null;
  isAfk: boolean;
  reportsCount: number;
  lastSeenAt: string; // ISO
  /** Аватар из кеша Steam; null — профиля в кеше нет. */
  avatarUrl: string | null;
}

/** Режим игры считается по размеру команды: 1 — соло, ... 5 и больше — клан. */
export type TeamMode = 'solo' | 'duo' | 'trio' | 'squad' | 'clan';

/** Товарищ по команде — вкладка «Команда» в карточке игрока. */
export interface TeamMate {
  steamId: string;
  name: string;
  status: PlayerStatus;
  avatarUrl: string | null;
}

/** Жалоба на игрока — вкладка «Репорты». */
export interface PlayerReport {
  id: string;
  reporterName: string | null;
  reporterSteamId: string;
  subject: string | null;
  message: string | null;
  createdAt: string;
}

/** Событие из лога активности игрока. */
export interface PlayerActivity {
  id: string;
  type: string;
  createdAt: string;
  serverName: string;
}

/** Боевая статистика за последние 7 дней. */
export interface CombatStats {
  kills: number;
  deaths: number;
  headshots: number;
  /** Убийства на смерть; при нуле смертей равно числу убийств. */
  kd: number;
}

/** Полная карточка игрока — вкладка «Обзор» в модальном окне. */
export interface PlayerDetails {
  steamId: string;
  name: string;
  clientType: ClientType;
  status: PlayerStatus;
  isAfk: boolean;
  reportsCount: number;
  ping: number;
  avatarUrl: string | null;

  /** Об игроке */
  teamSize: number;
  teamMode: TeamMode;
  language: string | null;

  /** Играл на */
  serverId: string;
  serverName: string;
  firstSeenAt: string; // ISO — первый заход на сервер проекта
  lastSeenAt: string; // ISO
  /** Наиграно на проекте, секунд: сумма сессий плюс текущая незакрытая. */
  playtimeSec: number;
  /** Длительность текущей сессии, секунд; null — игрок не на сервере. */
  sessionSec: number | null;

  /** Состояние: квадрат карты по живым координатам; null — координат нет. */
  square: string | null;
  /** Когда игрок последний раз двигался; null — координаты не приходили. */
  movedAt: string | null;

  /** Вкладки карточки */
  combat: CombatStats;
  team: TeamMate[];
  reports: PlayerReport[];
  activity: PlayerActivity[];

  /** Сеть */
  ip: string;
  city: string | null;
  country: string | null;
  isp: string | null;
  /** null — провайдер неизвестен, вердикта нет. */
  isVpn: boolean | null;

  /** Информация из Steam */
  steam: {
    available: boolean;
    rustMinutes: number | null;
    rustMinutes2Weeks: number | null;
    vacBanned: boolean;
    vacBanCount: number;
    gameBanCount: number;
    daysSinceLastBan: number | null;
    visibility: number | null;
    accountCreatedAt: string | null;
    error: string | null;
  };

  /** Проверка */
  discord: string | null;
  checkRequestedAt: string | null;
}

export interface PlayerStats {
  total: number;
  online: number;
  offline: number;
}

export type PanelEventType =
  | 'player_connected'
  | 'player_disconnected'
  | 'player_reported'
  | 'player_banned'
  | 'player_unbanned'
  /** Пачка убийств и смертей от плагина; панель раскладывает её на два типа ниже. */
  | 'combat_log'
  | 'player_killed'
  | 'player_died'
  | 'chat_message'
  | 'violation'
  | 'sign_updated'
  | 'multiaccount_detected'
  | 'combat_anomaly'
  | 'discord_linked';

export interface PanelEvent {
  id: string;
  type: PanelEventType;
  /** Проект-владелец: по нему поток событий отсекает чужие проекты. */
  projectId: string;
  serverId: string;
  serverName: string;
  timestamp: number; // unix seconds
  payload: Record<string, unknown>;
}

/** Событие входа — для тоста. */
export interface ConnectedEventPayload {
  steamId: string;
  name: string;
  ip?: string;
}

/** Событие мультиаккаунта — для тоста. */
export interface MultiaccountEventPayload {
  steamId: string;
  name: string;
  ip?: string;
  count: number;
  relatedSteamIds?: string[];
}

/* ---------- Тела запросов от игрового сервера ---------- */

export interface HeartbeatPlayer {
  steamId: string;
  name: string;
  ip: string;
  ping: number;
  connectedSec: number;
  isSleeping: boolean;
  isAfk: boolean;
  ownerSteamId?: string;
  authLevel?: number;
  /** Плагин сообщает лицензионность; панель дополнительно проверяет формат SteamID64. */
  licensed?: boolean;
  /** Размер команды из RelationshipManager: 1 — соло, 2 — дуо и так далее. */
  teamSize?: number;
  /** Язык клиента ("ru", "en", …). */
  language?: string;
}

export interface HeartbeatBody {
  serverId: string;
  serverName: string;
  timestamp: number;
  hostname?: string;
  maxPlayers?: number;
  uptimeSec?: number;
  /** Очередь на вход и игроки в процессе подключения — для карточек главной. */
  queuedPlayers?: number;
  joiningPlayers?: number;
  /** World.Seed и World.Size — по ним панель находит карту на rustmaps. */
  seed?: number;
  worldSize?: number;
  players: HeartbeatPlayer[];
}

export interface IngestEventBody {
  serverId: string;
  type: PanelEventType;
  timestamp: number;
  payload: Record<string, unknown>;
}

export interface PanelCommand {
  id: string;
  /**
   * check — предупреждение о вызове на проверку;
   * check_banner / check_banner_hide — баннер на весь экран;
   * check_pm — личное сообщение от панели только этому игроку;
   * check_result — итог проверки лично игроку;
   * check_announce — объявление об итоге на весь сервер;
   * say — реплика панели в общий чат сервера, steamId не используется;
   * check_end — проверка закрыта: снять баннер и перестать следить за игроком;
   * ban_team — бан всей команды игрока;
   * unban — снятие бана из раздела «Баны».
   */
  type:
    | 'kick'
    | 'ban'
    | 'ban_team'
    | 'unban'
    | 'check'
    | 'check_banner'
    | 'check_banner_hide'
    | 'check_pm'
    | 'check_result'
    | 'check_announce'
    | 'check_end'
    | 'say';
  steamId: string;
  /** Для kick/ban — причина, для check/check_banner/check_pm — текст для игрока. */
  reason: string;
}
