'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Check, Copy, Download, FileCode2, X } from 'lucide-react';

interface Props {
  projectName: string;
  hasLogo: boolean;
  /**
   * Задан при переподключении: код привязывается к этому серверу, обмен перевыдаёт
   * ему ключи, а не заводит новую запись. Данные и баны сервера остаются.
   */
  serverId?: string;
  onClose: () => void;
  /** Сервер обменял код на ключи — можно обновлять списки и закрывать шаг. */
  onPaired: () => void;
}

type PairStatus = 'pending' | 'paired' | 'expired' | 'unknown';

const POLL_MS = 3000;
const PLUGIN_FILE = 'YnaziCotTvBridge.cs';

/**
 * Подключение сервера. Механика прежняя: панель выдаёт одноразовый код,
 * плагин обменивает его на ключи командой в консоли. Изменилась только подача.
 */
export default function ConnectServerModal({
  projectName,
  hasLogo,
  serverId,
  onClose,
  onPaired,
}: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState<PairStatus>('pending');
  const [serverName, setServerName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const notified = useRef(false);

  const reconnect = Boolean(serverId);

  const issueCode = useCallback(async () => {
    setCopied(false);
    notified.current = false;
    try {
      const url = serverId
        ? `/api/servers/${encodeURIComponent(serverId)}/reconnect`
        : '/api/pair/code';
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) throw new Error(`pair code: ${res.status}`);
      const data = (await res.json()) as { code: string };
      setCode(data.code);
      setStatus('pending');
      setServerName(null);
    } catch (err) {
      console.error(err);
    }
  }, [serverId]);

  useEffect(() => {
    void issueCode();
  }, [issueCode]);

  // Ждём, пока плагин обменяет код на ключи.
  useEffect(() => {
    if (!code || status !== 'pending') return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/pair/code?code=${encodeURIComponent(code)}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as { status: PairStatus; serverName?: string | null };
        setStatus(data.status);
        if (data.status === 'paired' && !notified.current) {
          notified.current = true;
          setServerName(data.serverName ?? null);
          onPaired();
        }
      } catch (err) {
        console.error(err);
      }
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [code, status, onPaired]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const command = code ? `ynazicottv.setup ${code}` : '';

  const copy = async () => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(4,4,6,0.7)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card w-full max-w-[420px] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Подключение сервера"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 pb-6 pt-7 text-center">
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            <X size={15} />
          </button>

          <div className="flex items-center justify-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-hover">
              {hasLogo ? (
                // Логотип проекта отдаётся из базы, оптимизатор next/image здесь лишний.
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/api/project/logo" alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[18px] font-bold text-text-muted">
                  {projectName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </span>

            <ArrowLeftRight size={16} className="shrink-0 text-text-muted" />

            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-hover">
              <FileCode2 size={22} className="text-text-muted" />
            </span>
          </div>

          <div className="mt-4 text-[15px] font-semibold">
            {reconnect ? 'Переподключение сервера' : 'Подключение сервера'}
          </div>
          <div className="mt-0.5 text-[13px] text-text-muted">
            {reconnect ? 'ключи будут перевыданы, данные останутся' : `к проекту ${projectName}`}
          </div>
        </div>

        <div className="space-y-4 border-t border-border p-5">
          {status === 'paired' ? (
            <div className="py-2 text-center">
              <div
                className="inline-flex items-center gap-2 text-[13px] font-medium"
                style={{ color: 'var(--success)' }}
              >
                <Check size={16} />
                {reconnect ? 'Сервер переподключён' : 'Сервер подключён'}
                {serverName ? `: ${serverName}` : ''}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                Данные появятся после первого heartbeat — обычно в течение 30 секунд.
              </p>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => void issueCode()} className="btn-ghost flex-1">
                  {reconnect ? 'Новый код' : 'Подключить ещё'}
                </button>
                <button type="button" onClick={onClose} className="btn-primary flex-1">
                  Готово
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[13px] leading-relaxed text-text-muted">
                Скачайте и поместите плагин <span className="font-semibold text-text">{PLUGIN_FILE}</span>{' '}
                в папку <span className="font-semibold text-text">plugins</span> на вашем сервере.
              </p>

              <a
                href="/api/plugin/download"
                download={PLUGIN_FILE}
                className="flex items-center gap-2.5 rounded-control border border-border bg-surface-hover px-3.5 py-2.5 text-[13px] font-medium transition-colors hover:bg-surface-raised"
              >
                <FileCode2 size={15} className="shrink-0 text-text-muted" />
                <span className="flex-1 truncate">{PLUGIN_FILE}</span>
                <Download size={15} className="shrink-0 text-text-muted" />
              </a>

              <p className="pt-1 text-[13px] text-text-muted">Выполните команду в консоли сервера:</p>

              <div className="flex items-center gap-2 rounded-control border border-border bg-surface-hover px-3.5 py-2.5">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px] scrollbar-thin">
                  {command || 'получаю код…'}
                </code>
                <button
                  type="button"
                  onClick={() => void copy()}
                  disabled={!command}
                  aria-label="Скопировать команду"
                  className="shrink-0 text-text-muted transition-colors hover:text-text disabled:opacity-40"
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>

              <p className="text-[11px] leading-relaxed text-text-dim">
                {status === 'expired'
                  ? 'Код просрочен.'
                  : 'Код одноразовый и живёт 15 минут. Ждём сервер…'}{' '}
                <button
                  type="button"
                  onClick={() => void issueCode()}
                  className="underline decoration-border-strong underline-offset-2 transition-colors hover:text-text-muted"
                >
                  Получить новый
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
