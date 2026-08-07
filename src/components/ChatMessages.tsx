'use client';

import { useEffect, useRef } from 'react';
import { Inbox } from 'lucide-react';
import Avatar from '@/components/Avatar';
import type { ChatMessage } from '@/lib/chatShared';

interface Props {
  messages: ChatMessage[];
  keywords: string[];
  highlightColor: string;
  connected: boolean;
  loading: boolean;
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
}: {
  message: ChatMessage;
  keywords: string[];
  highlightColor: string;
}) {
  const flagged = hasKeyword(message.message, keywords);

  return (
    <div className="flex items-start gap-3 rounded-control px-3 py-2 transition-colors hover:bg-surface">
      <Avatar name={message.name} size={30} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[13px] font-semibold">{message.name}</span>
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
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

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
          <Row key={m.id} message={m} keywords={keywords} highlightColor={highlightColor} />
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
