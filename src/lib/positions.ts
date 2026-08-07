/**
 * Живые координаты игроков.
 *
 * Держим в памяти процесса, а не в базе: значения меняются каждые несколько секунд
 * и не нужны исторически, а писать сотни строк в Postgres на каждый тик — лишняя нагрузка.
 * Под несколько нод заменяется на Redis без изменения сигнатур.
 */

/** Позиции старше этого срока считаем протухшими и не отдаём. */
const STALE_MS = 30_000;

export interface PlayerPosition {
  steamId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  isAfk: boolean;
}

interface Snapshot {
  at: number;
  players: PlayerPosition[];
}

const globalForPositions = globalThis as unknown as {
  __ynazicottvPositions?: Map<string, Snapshot>;
};

const store: Map<string, Snapshot> =
  globalForPositions.__ynazicottvPositions ?? new Map();
globalForPositions.__ynazicottvPositions = store;

export function setPositions(serverId: string, players: PlayerPosition[]): void {
  store.set(serverId, { at: Date.now(), players });
}

export function getPositions(serverId: string): { at: number; players: PlayerPosition[] } {
  const snapshot = store.get(serverId);
  if (!snapshot || Date.now() - snapshot.at > STALE_MS) {
    return { at: snapshot?.at ?? 0, players: [] };
  }
  return snapshot;
}

export function clearPositions(serverId: string): void {
  store.delete(serverId);
}
