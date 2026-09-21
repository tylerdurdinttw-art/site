'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Inbox } from 'lucide-react';
import Avatar from '@/components/Avatar';
import ChatMuteMenu from '@/components/ChatMuteMenu';
import { PANEL_CHANNEL, type ChatMessage } from '@/lib/chatShared';

interface Props {
  messages: ChatMessage[];
  keywords: string[];
  highlightColor: string;
  connected: boolean;
  loading: boolean;
  /** Итог мута из меню игрока — страница показывает его под лентой. */
  onNotice?: (text: string) => void;
}

function formatStamp(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function hasKeyword(message: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const lower = message.toLowerCase();
  return keywords.some((word) => lower.includes(word));
}

function Row({
  message,
  keywords,
  highlightColor,
  menuOpen,
  onPlayerClick,
}: {
  message: ChatMessage;
  keywords: string[];
  highlightColor: string;
  menuOpen: boolean;
  onPlayerClick: (message: ChatMessage, anchor: HTMLElement) => void;
}) {
  const flagged = hasKeyword(message.message, keywords);
  // Реплики самой панели отделяем цветом ника: в ленте они идут вперемешку с игроками.
  const fromPanel = message.channel === PANEL_CHANNEL;
  // Мутить можно только игрока: у реплик панели SteamID нет.
  const mutable = !fromPanel && Boolean(message.steamId);

  const name = (
    <span
      className="text-[13px] font-semibold"
      style={fromPanel ? { color: 'var(--accent)' } : undefined}
    >
      {message.name}
    </span>
  );

  return (
    <div
      className={`flex items-start gap-3 rounded-control px-3 py-2 transition-colors hover:bg-surface ${
        menuOpen ? 'bg-surface' : ''
      }`}
    >
      {mutable ? (
        <button
          type="button"
          title="Мут"
          aria-label={`Мут: ${message.name}`}
          onClick={(e) => onPlayerClick(message, e.currentTarget)}
          className="shrink-0 rounded-full transition-opacity hover:opacity-80"
        >
          <Avatar name={message.name} steamId={message.steamId} size={30} />
        </button>
      ) : (
        <Avatar name={message.name} steamId={message.steamId} size={30} />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          {mutable ? (
            <button
              type="button"
              title="Мут"
              onClick={(e) => onPlayerClick(message, e.currentTarget)}
              className={`rounded-sm text-left transition-colors hover:underline ${
                menuOpen ? 'underline' : ''
              }`}
            >
              {name}
            </button>
          ) : (
            name
          )}
          <span className="text-[11px] text-text-dim">[{message.channel}]</span>
          <span className="truncate text-[11px] text-text-dim">{message.serverName}</span>
          <span className="ml-auto shrink-0 font-mono text-[11px] text-text-dim">
            {formatStamp(message.timestamp)}
          </span>
        </div>

        <div
          className="mt-0.5 break-words text-[13px]"
          style={flagged ? { color: highlightColor } : undefined}
        >
          {message.message}
        </div>
      </div>
    </div>
  );
}

/** Лента сообщений: скроллится вниз при появлении новых. */
export default function ChatMessages({
  messages,
  keywords,
  highlightColor,
  connected,
  loading,
  onNotice,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ message: ChatMessage; anchor: HTMLElement } | null>(null);

  // Повторный клик по тому же игроку закрывает меню, по другому — переносит его.
  const openMenu = useCallback((message: ChatMessage, anchor: HTMLElement) => {
    setMenu((current) => (current?.message.id === message.id ? null : { message, anchor }));
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const done = useCallback(
    (text: string) => {
      setMenu(null);
      onNotice?.(text);
    },
    [onNotice],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (loading) {
    return (
      <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-control bg-surface" />
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <Inbox size={34} className="text-text-dim" />
        <div className="text-[14px] font-semibold">Сообщения не найдены</div>
        <p className="max-w-[340px] text-[13px] leading-relaxed text-text-muted">
          {connected
            ? 'Попробуйте изменить фильтры или дождитесь первых сообщений'
            : 'Плагин ещё не подключён — сообщениям неоткуда взяться. Подключите сервер в разделе «Серверы».'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
      <div className="space-y-0.5">
        {messages.map((m) => (
          <Row
            key={m.id}
            message={m}
            keywords={keywords}
            highlightColor={highlightColor}
            menuOpen={menu?.message.id === m.id}
            onPlayerClick={openMenu}
          />
        ))}
      </div>
      <div ref={bottomRef} />

      {menu && (
        <ChatMuteMenu
          // Новый игрок — чистое меню, без чужой причины и срока.
          key={menu.message.id}
          message={menu.message}
          anchor={menu.anchor}
          onClose={closeMenu}
          onDone={done}
        />
      )}
    </div>
  );
}
