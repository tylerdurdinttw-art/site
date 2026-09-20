'use client';

import { useEffect, useState } from 'react';
import type { PlayerStatus } from '@/lib/types';

const STATUS_COLOR: Record<PlayerStatus, string> = {
  online: 'var(--success)',
  sleeping: 'var(--warning)',
  offline: 'var(--text-dim)',
};

/** SteamID64 лицензионного клиента — только у таких вообще есть аватар. */
const STEAM_ID_64 = /^7656119\d{10}$/;

interface Props {
  name: string;
  /** SteamID: с ним картинка берётся из кеша панели, а не с CDN Steam. */
  steamId?: string | null;
  avatarUrl?: string | null;
  status?: PlayerStatus;
  size?: number;
}

/**
 * Аватар игрока с точкой статуса. Без картинки — первая буква ника.
 *
 * Источник по возможности свой: /api/avatar/<steamId> отдаёт картинку из базы
 * панели. CDN Steam открывается не отовсюду и отвечает медленно — из-за него
 * аватарки грузились через раз. Прямая ссылка остаётся запасным вариантом,
 * а если не сработала и она — рисуется буква.
 */
export default function Avatar({ name, steamId, avatarUrl, status, size = 36 }: Props) {
  const proxied = steamId && STEAM_ID_64.test(steamId) ? `/api/avatar/${steamId}` : null;
  const sources = [proxied, avatarUrl].filter((src): src is string => Boolean(src));

  const [attempt, setAttempt] = useState(0);
  // Игрок в строке мог смениться (список перерисовался) — начинаем подбор заново.
  useEffect(() => setAttempt(0), [proxied, avatarUrl]);

  const src = sources[attempt] ?? null;
  const dot = Math.max(8, Math.round(size * 0.28));

  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {src ? (
        // Картинка отдаётся своим эндпоинтом из базы — оптимизатор next/image тут не нужен.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setAttempt((n) => n + 1)}
          className="h-full w-full rounded-full bg-surface-hover object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full bg-surface-hover font-semibold text-text-muted"
          style={{ fontSize: Math.round(size * 0.38) }}
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}

      {status && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full border-2"
          style={{
            width: dot,
            height: dot,
            backgroundColor: STATUS_COLOR[status],
            borderColor: 'var(--bg)',
          }}
        />
      )}
    </span>
  );
}
