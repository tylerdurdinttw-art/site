'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import PageTopBar, { FilterGroup } from '@/components/PageTopBar';
import ChatMessages from '@/components/ChatMessages';
import KeywordFilters, { type Keyword } from '@/components/KeywordFilters';
import {
  DEFAULT_HIGHLIGHT_COLOR,
  MAX_CHAT_MESSAGE_LENGTH,
  PANEL_CHANNEL,
  type ChatMessage,
} from '@/lib/chatShared';

const REFRESH_MS = 10_000;

/** Каналы, которые присылает плагин: общий чат, командный и чат-команды. */
const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Все каналы' },
  { value: 'GLOBAL', label: 'Общий' },
  { value: 'TEAM', label: 'Командный' },
  { value: 'COMMAND', label: 'Команды' },
  { value: PANEL_CHANNEL, label: 'Из панели' },
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

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const loadChat = useCallback(async () => {
    try {
      const res = await fetch('/api/chat', { cache: 'no-store' });
      if (!res.ok) throw new Error(`chat: ${res.status}`);
      const data = (await res.json()) as { connected: boolean; messages: ChatMessage[] };
      setConnected(data.connected);
      setMessages(data.messages);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const send = async () => {
    const message = draft.trim();
    if (!message || sending) return;

    setSending(true);
    setSendError(null);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setSendError(body.error ?? 'Сообщение не отправлено.');
        return;
      }
      setDraft('');
      // Своя реплика уже записана в ленту — перечитываем, чтобы она появилась сразу.
      await loadChat();
    } catch (err) {
      console.error(err);
      setSendError('Панель не отвечает.');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

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
  }, [loadChat]);

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

      {/* Сообщение уходит всем серверам на связи; фильтр выше — только про просмотр. */}
      <div className="border-t border-border px-6 py-3">
        <form
          className="flex items-center gap-3 rounded-control border border-border bg-surface px-3 py-2 focus-within:border-border-strong"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <MessageSquare size={16} className="shrink-0 text-text-dim" />
          <input
            value={draft}
            maxLength={MAX_CHAT_MESSAGE_LENGTH}
            disabled={sending}
            onChange={(e) => {
              setDraft(e.target.value);
              setSendError(null);
            }}
            onKeyDown={(e) => {
              // Явная отправка по Enter: неявный сабмит формы срабатывает не во всех
              // браузерах, а поле здесь единственное.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={connected ? 'Введите сообщение...' : 'Плагин не на связи'}
            aria-label="Введите сообщение"
            className="flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-text-dim disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={draft.trim().length === 0 || sending}
            aria-label="Отправить"
            className="shrink-0 text-text-muted transition-colors hover:text-text disabled:opacity-40"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>

        {sendError && (
          <div className="mt-1.5 text-[12px]" style={{ color: 'var(--danger)' }}>
            {sendError}
          </div>
        )}
      </div>
    </div>
  );
}
