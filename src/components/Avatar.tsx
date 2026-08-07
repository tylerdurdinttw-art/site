import type { PlayerStatus } from '@/lib/types';

const STATUS_COLOR: Record<PlayerStatus, string> = {
  online: 'var(--success)',
  sleeping: 'var(--warning)',
  offline: 'var(--text-dim)',
};

interface Props {
  name: string;
  avatarUrl?: string | null;
  status?: PlayerStatus;
  size?: number;
}

/** Аватар игрока с точкой статуса. Без картинки — первая буква ника. */
export default function Avatar({ name, avatarUrl, status, size = 36 }: Props) {
  const dot = Math.max(8, Math.round(size * 0.28));

  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {avatarUrl ? (
        // Аватары лежат на CDN Steam; гонять их через оптимизатор next/image смысла нет.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full rounded-full object-cover"
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
