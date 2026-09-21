'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2, MicOff, Volume2 } from 'lucide-react';
import Avatar from '@/components/Avatar';
import {
  DEFAULT_MUTE_REASON,
  formatMuteDuration,
  MAX_MUTE_REASON_LENGTH,
  MAX_MUTE_SECONDS,
  MUTE_PRESETS,
  type ChatMessage,
} from '@/lib/chatShared';

const MENU_WIDTH = 272;
const GAP = 6;
const EDGE = 8;

const UNITS: { value: number; label: string }[] = [
  { value: 60, label: 'мин' },
  { value: 3600, label: 'ч' },
  { value: 86_400, label: 'д' },
];

interface Props {
  message: ChatMessage;
  /** Ник, по которому кликнули: меню держится рядом с ним, даже если лента прокрутилась. */
  anchor: HTMLElement;
  onClose: () => void;
  /** Итог для строки под лентой: меню после успеха закрывается. */
  onDone: (text: string) => void;
}

/**
 * Меню игрока из ленты чата: мут на готовый или свой срок и снятие мута.
 * Мут выдаёт плагин Chat на сервере, где написано сообщение, — панель только
 * ставит команду в очередь QuickPanelBridge.
 */
export default function ChatMuteMenu({ message, anchor, onClose, onDone }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState(UNITS[0].value);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Под ником, а если снизу не хватает места — над ним. Лента живая и прокручивается
  // сама при новых сообщениях, поэтому позицию пересчитываем на каждый скролл.
  const place = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    if (!anchor.isConnected) {
      onClose();
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const height = box.offsetHeight;
    const left = Math.min(Math.max(EDGE, rect.left), window.innerWidth - MENU_WIDTH - EDGE);
    let top = rect.bottom + GAP;
    if (top + height > window.innerHeight - EDGE) top = Math.max(EDGE, rect.top - GAP - height);

    setPos({ left, top });
  }, [anchor, onClose]);

  const customSeconds = (() => {
    const value = Number(amount.replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? Math.round(value * unit) : 0;
  })();
  const customValid = customSeconds >= 1 && customSeconds <= MAX_MUTE_SECONDS;
  const showHint = amount !== '' && !customValid;

  // Ошибка и подсказка меняют высоту — меню над ником иначе наехало бы на него.
  useLayoutEffect(place, [place, error, showHint]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (boxRef.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchor, onClose, place]);

  const submit = async (key: string, seconds: number | null) => {
    if (busy) return;
    setBusy(key);
    setError(null);

    try {
      const res = await fetch('/api/chat/mute', {
        method: seconds === null ? 'DELETE' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          steamId: message.steamId,
          serverId: message.serverId,
          seconds,
          reason: reason.trim(),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? 'Команда не отправлена.');
        return;
      }

      onDone(
        seconds === null
          ? `${message.name}: снятие мута отправлено на ${message.serverName}`
          : `${message.name}: мут на ${formatMuteDuration(seconds)} отправлен на ${message.serverName}`,
      );
    } catch (err) {
      console.error(err);
      setError('Панель не отвечает.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label={`Мут: ${message.name}`}
      className="card fixed z-50 p-3 shadow-xl"
      style={{
        width: MENU_WIDTH,
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        // Первый кадр — только замер высоты, чтобы меню не мигнуло не на своём месте.
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      <div className="flex items-center gap-2.5">
        <Avatar name={message.name} steamId={message.steamId} size={32} />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{message.name}</div>
          <div className="truncate font-mono text-[11px] text-text-dim">{message.steamId}</div>
        </div>
      </div>

      <div className="mb-1.5 mt-3 flex items-center gap-1.5 text-[12px] text-text-muted">
        <MicOff size={12} />
        Мут в чате
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {MUTE_PRESETS.map((preset) => (
          <button
            key={preset.seconds}
            type="button"
            disabled={busy !== null}
            onClick={() => void submit(`p${preset.seconds}`, preset.seconds)}
            className="flex h-8 items-center justify-center rounded-control border border-border bg-surface-hover font-mono text-[12px] text-text transition-colors hover:border-border-strong hover:bg-surface-raised disabled:opacity-50"
          >
            {busy === `p${preset.seconds}` ? <Loader2 size={13} className="animate-spin" /> : preset.label}
          </button>
        ))}
      </div>

      <form
        className="mt-1.5 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (customValid) void submit('custom', customSeconds);
        }}
      >
        <input
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setError(null);
          }}
          inputMode="decimal"
          placeholder="Своё время"
          aria-label="Свой срок мута"
          className="h-8 min-w-0 flex-1 rounded-control border border-border bg-surface-hover px-2.5 text-[12px] text-text outline-none placeholder:text-text-dim focus:border-border-strong"
        />
        <select
          value={unit}
          onChange={(e) => setUnit(Number(e.target.value))}
          aria-label="Единица срока"
          className="h-8 rounded-control border border-border bg-surface-hover px-1.5 text-[12px] text-text outline-none focus:border-border-strong"
        >
          {UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!customValid || busy !== null}
          className="flex h-8 min-w-[64px] items-center justify-center rounded-control bg-accent px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          {busy === 'custom' ? <Loader2 size={13} className="animate-spin" /> : 'Мут'}
        </button>
      </form>

      {showHint && (
        <div className="mt-1 text-[11px] text-text-dim">
          Срок — до {formatMuteDuration(MAX_MUTE_SECONDS)}
        </div>
      )}

      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={MAX_MUTE_REASON_LENGTH}
        placeholder={`Причина: ${DEFAULT_MUTE_REASON}`}
        aria-label="Причина мута"
        className="mt-1.5 h-8 w-full rounded-control border border-border bg-surface-hover px-2.5 text-[12px] text-text outline-none placeholder:text-text-dim focus:border-border-strong"
      />

      <div className="my-2.5 border-t border-border" />

      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void submit('unmute', null)}
        className="flex h-8 w-full items-center gap-2 rounded-control px-2 text-left text-[12px] text-text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-50"
      >
        {busy === 'unmute' ? <Loader2 size={13} className="animate-spin" /> : <Volume2 size={13} />}
        Снять мут
      </button>

      {error && (
        <div className="mt-2 text-[12px]" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div className="mt-2 text-[11px] leading-snug text-text-dim">
        Выдаёт плагин Chat на сервере {message.serverName}
      </div>
    </div>
  );
}
