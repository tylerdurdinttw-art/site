import { EventEmitter } from 'node:events';
import type { PanelEvent } from '@/lib/types';

/**
 * Внутрипроцессная шина событий для SSE + короткий кольцевой буфер
 * для фолбэка на поллинг (клиент запрашивает события «после id»).
 * Под несколько нод заменяется на Redis pub/sub.
 */

const RING_SIZE = 200;

const globalForBus = globalThis as unknown as {
  __ynazicottvBus?: EventEmitter;
  __ynazicottvRing?: PanelEvent[];
};

export const bus: EventEmitter =
  globalForBus.__ynazicottvBus ?? new EventEmitter().setMaxListeners(0);
globalForBus.__ynazicottvBus = bus;

const ring: PanelEvent[] = globalForBus.__ynazicottvRing ?? [];
globalForBus.__ynazicottvRing = ring;

export function publish(event: PanelEvent): void {
  ring.push(event);
  if (ring.length > RING_SIZE) ring.splice(0, ring.length - RING_SIZE);
  bus.emit('event', event);
}

/**
 * События проекта после указанного id. Если id неизвестен — последние 20.
 * Кольцо общее на процесс, поэтому чужие проекты отсекаются здесь же:
 * поллинг не должен показывать больше, чем SSE.
 */
export function eventsSince(projectId: string, lastId: string | null): PanelEvent[] {
  const own = ring.filter((e) => e.projectId === projectId);
  if (!lastId) return own.slice(-20);
  const idx = own.findIndex((e) => e.id === lastId);
  if (idx === -1) return own.slice(-20);
  return own.slice(idx + 1);
}
