'use client';

import { useEffect, useMemo, useState } from 'react';
import { CircleHelp, MessageSquare } from 'lucide-react';
import PageTopBar, { FilterGroup } from '@/components/PageTopBar';
import ChatMessages from '@/components/ChatMessages';
import KeywordFilters, { type Keyword } from '@/components/KeywordFilters';
import { DEFAULT_HIGHLIGHT_COLOR, type ChatMessage } from '@/lib/chatShared';

const REFRESH_MS = 10_000;

/** Каналы, которые присылает плагин: общий чат, командный и чат-команды. */
const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Все каналы' },
  { value: 'GLOBAL', label: 'Общий' },
  { value: 'TEAM', label: 'Командный' },
  { value: 'COMMAND', label: 'Команды' },
];

/** Кнопка в ряду фильтров над лентой. */
function ToolButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof MessageSquare;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = `flex h-8 w-8 items-center justify-center rounded-control border transition-colors ${
    active
      ? 'border-border-strong bg-surface-hover text-text'
      : 'border-border bg-surface text-text-muted hover:bg-surface-hover'
  }`;

  if (!onClick) {
    return (
      <div title={label} className={`${className} cursor-default`}>
        <Icon size={14} />
      </div>
    );
  }

  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className={className}>
      <Icon size={14} />
    </button>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [color, setColor] = useState(DEFAULT_HIGHLIGHT_COLOR);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [channel, setChannel] = useState('all');
  const [server, setServer] = useState('all');

  useEffect(() => {
    let cancelled = false;

    const loadChat = async () => {
      try {
        const res = await fetch('/api/chat', { cache: 'no-store' });
        if (!res.ok) throw new Error(`chat: ${res.status}`);
        const data = (await res.json()) as { connected: boolean; messages: ChatMessage[] };
        if (cancelled) return;
        setConnected(data.connected);
        setMessages(data.messages);
      } catch (err) {
        console.error(err);
      }
    };

    void (async () => {
      try {
        const res = await fetch('/api/chat/filters', { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as { keywords: Keyword[]; color: string };
          if (!cancelled) {
            setKeywords(data.keywords);
            setColor(data.color);
          }
        }
      } catch (err) {
        console.error(err);
      }

      await loadChat();
      if (!cancelled) setLoading(false);
    })();

    const timer = setInterval(() => void loadChat(), REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const serverOptions = useMemo(() => {
    const names = Array.from(new Set(messages.map((m) => m.serverName))).sort();
    return [{ value: 'all', label: 'Все серверы' }, ...names.map((n) => ({ value: n, label: n }))];
  }, [messages]);

  const visible = useMemo(
    () =>
      messages.filter(
        (m) =>
          (channel === 'all' || m.channel === channel) &&
          (server === 'all' || m.serverName === server),
      ),
    [messages, channel, server],
  );

  return (
    <div className="flex h-screen flex-col">
      <PageTopBar
        title="Чат"
        filtersActive={channel !== 'all' || server !== 'all'}
        filters={
          <>
            <FilterGroup
              label="Канал"
              value={channel}
              options={CHANNEL_OPTIONS}
              onChange={setChannel}
            />
            <FilterGroup label="Сервер" value={server} options={serverOptions} onChange={setServer} />
          </>
        }
      />

      <div className="flex items-center gap-2 border-b border-border px-6 py-2.5">
        <ToolButton
          icon={MessageSquare}
          label="Ключевые слова"
          active={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <ChatMessages
          messages={visible}
          keywords={keywords.map((k) => k.word.toLowerCase())}
          highlightColor={color}
          connected={connected}
          loading={loading}
        />

        {filtersOpen && (
          <div className="w-[240px] shrink-0 overflow-y-auto scrollbar-thin border-l border-border p-4">
            <KeywordFilters
              keywords={keywords}
              color={color}
              onChange={(data) => {
                setKeywords(data.keywords);
                setColor(data.color);
              }}
            />
          </div>
        )}
      </div>

      {/* Авторизации в панели нет — отправка сообщений пока недоступна. */}
      <div className="border-t border-border px-6 py-3">
        <div
          className="flex items-center gap-3 rounded-control border border-border bg-surface px-3 py-2"
          title="Для отправки сообщений нужны права — они появятся вместе с авторизацией"
        >
          <CircleHelp size={16} className="shrink-0 text-text-dim" />
          <input
            disabled
            placeholder="Введите сообщение..."
            aria-label="Введите сообщение"
            className="flex-1 cursor-not-allowed bg-transparent text-[13px] text-text outline-none placeholder:text-text-dim"
          />
        </div>
      </div>
    </div>
  );
}
