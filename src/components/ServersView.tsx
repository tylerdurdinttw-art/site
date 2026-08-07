'use client';

import { useCallback, useState } from 'react';
import ConnectServerModal from '@/components/ConnectServerModal';
import ServerTile from '@/components/ServersCard';
import type { ServerRow } from '@/lib/overview';
import type { ProjectState } from '@/lib/projectShared';

interface Props {
  project: ProjectState;
  initialServers: ServerRow[];
}

export default function ServersView({ project, initialServers }: Props) {
  const [servers, setServers] = useState(initialServers);
  const [connectOpen, setConnectOpen] = useState(false);
  /** id сервера, который переподключаем; null — обычное подключение нового. */
  const [reconnectId, setReconnectId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/servers', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { servers: ServerRow[] };
      setServers(data.servers);
    } catch (err) {
      console.error(err);
    }
  }, []);

  return (
    <div className="mx-auto max-w-[820px] px-8 py-10">
      <h1 className="text-[19px] font-semibold leading-tight">Список серверов</h1>
      <p className="mt-1 text-[13px] text-text-muted">Управление подключенными серверами</p>

      <div className="mt-7 border-t border-border pt-5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[14px] font-semibold">Серверы</span>
          <button
            type="button"
            onClick={() => {
              setReconnectId(null);
              setConnectOpen(true);
            }}
            className="text-[13px] font-medium text-accent transition-colors hover:text-accent-hover"
          >
            Подключить сервер
          </button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {servers.map((server) => (
            <ServerTile
              key={server.id}
              server={server}
              onReconnect={(id) => {
                setReconnectId(id);
                setConnectOpen(true);
              }}
              onDeleted={() => void reload()}
            />
          ))}

          {/* Пустое место под следующий сервер — как в макете. */}
          <button
            type="button"
            onClick={() => {
              setReconnectId(null);
              setConnectOpen(true);
            }}
            className="flex min-h-[220px] items-center justify-center rounded-card border border-dashed border-border text-[13px] text-text-dim transition-colors hover:border-border-strong hover:text-text-muted"
          >
            {servers.length === 0 ? 'Подключить первый сервер' : 'Подключить ещё'}
          </button>
        </div>
      </div>

      <div className="mt-7 border-t border-border pt-5">
        <div
          className="rounded-card border border-border p-4"
          style={{
            backgroundImage:
              'repeating-linear-gradient(-45deg, rgba(255,255,255,0.018) 0 8px, transparent 8px 16px)',
          }}
        >
          <div className="text-[13px] font-semibold">Удаление и переподключение серверов</div>
          <p
            className="mt-1.5 text-[13px] leading-relaxed"
            style={{ color: 'rgba(239,68,68,0.85)' }}
          >
            Обратите внимание: удаление сервера для его последующего переподключения — не лучшее
            решение, так как это приведёт к безвозвратной потере связанных с ним данных и банов. Если
            возникли неполадки, воспользуйтесь функцией переподключения или обратитесь в поддержку.
          </p>
        </div>
      </div>

      {connectOpen && (
        <ConnectServerModal
          projectName={project.name}
          hasLogo={project.hasLogo}
          serverId={reconnectId ?? undefined}
          onClose={() => setConnectOpen(false)}
          onPaired={() => void reload()}
        />
      )}
    </div>
  );
}
