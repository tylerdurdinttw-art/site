'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapIcon, RefreshCw, ServerOff, TriangleAlert, Users } from 'lucide-react';

const POSITIONS_POLL_MS = 3000;
/** Пока rustmaps генерирует карту, перепроверяем не слишком часто. */
const PENDING_RETRY_MS = 20_000;

interface ServerOption {
  id: string;
  name: string;
  online: boolean;
  seed: number | null;
  worldSize: number | null;
}

type MapData =
  | { source: 'rustmaps'; serverId: string; seed: number; worldSize: number; imageUrl: string }
  | { source: 'pending'; serverId: string; seed: number; worldSize: number }
  | {
      source: 'terrain';
      serverId: string;
      seed: number;
      worldSize: number;
      resolution: number;
      minHeight: number;
      maxHeight: number;
      heights: string;
    }
  | { source: 'unavailable'; serverId: string; reason: string; message: string | null };

interface PlayerPosition {
  steamId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  isAfk: boolean;
}

/** Запасная отрисовка: цвет точки по высоте, уровень моря в Rust — 0. */
function terrainColor(height: number): [number, number, number] {
  if (height < 0) {
    const depth = Math.min(1, -height / 50);
    return [16 + (1 - depth) * 26, 42 + (1 - depth) * 60, 78 + (1 - depth) * 90];
  }
  if (height < 3) return [204, 190, 148];
  if (height < 22) {
    const t = (height - 3) / 19;
    return [92 + t * 40, 118 - t * 18, 66 + t * 10];
  }
  if (height < 45) {
    const t = (height - 22) / 23;
    return [124 + t * 28, 112 + t * 26, 96 + t * 24];
  }
  const t = Math.min(1, (height - 45) / 25);
  return [176 + t * 60, 178 + t * 60, 182 + t * 58];
}

function decodeBase64(input: string): Uint8Array {
  const binary = atob(input);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export default function ServerMap() {
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [serverId, setServerId] = useState<string | null>(null);
  const [map, setMap] = useState<MapData | null>(null);
  const [players, setPlayers] = useState<PlayerPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/map', { cache: 'no-store' });
        if (!res.ok) throw new Error(`map list: ${res.status}`);
        const data = (await res.json()) as { servers: ServerOption[] };
        setServers(data.servers);
        setServerId(data.servers.find((s) => s.online)?.id ?? data.servers[0]?.id ?? null);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadMap = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/map?serverId=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`map: ${res.status}`);
      setMap((await res.json()) as MapData);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (!serverId) return;
    setMap(null);
    void loadMap(serverId);
  }, [serverId, loadMap]);

  // rustmaps ещё готовит карту — вернёмся через полминуты.
  useEffect(() => {
    if (!serverId || map?.source !== 'pending') return;
    const timer = setTimeout(() => void loadMap(serverId), PENDING_RETRY_MS);
    return () => clearTimeout(timer);
  }, [serverId, map, loadMap]);

  const loadPositions = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/map/positions?serverId=${encodeURIComponent(id)}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { players: PlayerPosition[] };
      setPlayers(data.players);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (!serverId) return;
    void loadPositions(serverId);
    const timer = setInterval(() => void loadPositions(serverId), POSITIONS_POLL_MS);
    return () => clearInterval(timer);
  }, [serverId, loadPositions]);

  // Отрисовка запасной сетки высот: строка 0 — юг, на экране юг внизу.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || map?.source !== 'terrain') return;

    const res = map.resolution;
    const heights = decodeBase64(map.heights);
    if (heights.length !== res * res) return;

    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const image = ctx.createImageData(res, res);
    const range = map.maxHeight - map.minHeight || 1;

    for (let row = 0; row < res; row++) {
      const y = res - 1 - row;
      for (let col = 0; col < res; col++) {
        const height = map.minHeight + (heights[row * res + col] / 255) * range;
        const [r, g, b] = terrainColor(height);
        const offset = (y * res + col) * 4;
        image.data[offset] = r;
        image.data[offset + 1] = g;
        image.data[offset + 2] = b;
        image.data[offset + 3] = 255;
      }
    }

    ctx.putImageData(image, 0, 0);
  }, [map]);

  const current = servers.find((s) => s.id === serverId) ?? null;
  const worldSize =
    map && 'worldSize' in map ? map.worldSize : current?.worldSize ?? null;

  // Мировые координаты -> проценты внутри квадрата карты.
  const markers = useMemo(() => {
    if (!worldSize) return [];
    const half = worldSize / 2;

    return players.map((p) => ({
      ...p,
      left: ((p.x + half) / worldSize) * 100,
      top: (1 - (p.z + half) / worldSize) * 100,
    }));
  }, [players, worldSize]);

  if (loading) return <div className="card h-[520px] animate-pulse" />;

  if (servers.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
        <ServerOff size={34} className="text-text-muted" />
        <div className="text-[14px] font-medium">Серверы не подключены</div>
        <p className="max-w-[440px] text-[12px] text-text-muted">
          Карта ищется на rustmaps по seed и размеру мира, которые присылает плагин. Подключите
          сервер на главной.
        </p>
      </div>
    );
  }

  const notice = (title: string, text: string, icon: React.ReactNode) => (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      {icon}
      <div className="text-[14px] font-medium">{title}</div>
      <p className="max-w-[460px] text-[12px] leading-relaxed text-text-muted">{text}</p>
    </div>
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(59,130,246,0.15)]">
            <MapIcon size={17} className="text-accent" />
          </div>
          <div>
            <div className="text-[15px] font-semibold leading-tight">{current?.name ?? 'Карта'}</div>
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-text-muted">
              <Users size={12} />
              На карте: <span className="text-accent">{markers.length}</span>
              {current?.seed ? (
                <span className="ml-2 font-mono">
                  seed {current.seed} · {current.worldSize} м
                </span>
              ) : null}
              {map?.source === 'terrain' ? (
                <span className="ml-2">— рельеф с сервера, rustmaps недоступен</span>
              ) : null}
            </div>
          </div>
        </div>

        {servers.length > 1 && (
          <select
            value={serverId ?? ''}
            onChange={(e) => setServerId(e.target.value)}
            className="h-10 rounded-control border border-border bg-surface-hover px-3 text-[13px] text-text"
          >
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="border-t border-border p-5">
        {!map && <div className="h-[520px] animate-pulse rounded-control bg-surface-hover" />}

        {map?.source === 'pending' &&
          notice(
            'rustmaps генерирует карту',
            'Такой seed у них ещё не отрисован. Обычно это занимает несколько минут — страница перепроверит сама.',
            <RefreshCw size={30} className="animate-spin text-text-muted" />,
          )}

        {map?.source === 'unavailable' &&
          notice(
            'Карта недоступна',
            map.message ??
              'Панель не смогла получить карту с rustmaps и не имеет запасного рельефа от плагина.',
            <TriangleAlert size={30} className="text-warning" />,
          )}

        {(map?.source === 'rustmaps' || map?.source === 'terrain') && (
          <div className="mx-auto w-full max-w-[720px]">
            <div className="relative aspect-square w-full overflow-hidden rounded-control border border-border">
              {map.source === 'rustmaps' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={map.imageUrl}
                  alt={`Карта ${current?.name ?? ''}`}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 h-full w-full"
                  style={{ imageRendering: 'pixelated' }}
                />
              )}

              {markers.map((p) => (
                <div
                  key={p.steamId}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${p.left}%`, top: `${p.top}%` }}
                  title={`${p.name} — ${Math.round(p.x)}, ${Math.round(p.z)}`}
                >
                  <div
                    className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 text-center"
                    style={{
                      borderColor: p.isAfk ? 'var(--warning)' : 'var(--accent)',
                      backgroundColor: 'rgba(8,8,12,0.82)',
                    }}
                  >
                    <span className="px-0.5 text-[8px] font-semibold leading-none text-white">
                      {p.name.length > 7 ? `${p.name.slice(0, 6)}…` : p.name}
                    </span>
                  </div>
                </div>
              ))}

              {markers.length === 0 && (
                <div className="absolute inset-x-0 bottom-3 text-center text-[11px] text-white/70">
                  Сейчас на сервере никого нет
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
