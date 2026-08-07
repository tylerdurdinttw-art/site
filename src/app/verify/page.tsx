import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import { APP_NAME } from '@/lib/brand';
import { consumeVerifyToken, type VerifyResult } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MESSAGES: Record<VerifyResult, { title: string; text: string; ok: boolean }> = {
  ok: {
    title: 'Почта подтверждена',
    text: 'Аккаунт активирован. Теперь можно войти в панель.',
    ok: true,
  },
  already: {
    title: 'Уже подтверждено',
    text: 'Эта почта подтверждена раньше — просто войдите.',
    ok: true,
  },
  expired: {
    title: 'Ссылка просрочена',
    text: 'Ссылка действует 24 часа. Запросите новое письмо на странице входа.',
    ok: false,
  },
  invalid: {
    title: 'Ссылка не подошла',
    text: 'Токен не найден или уже использован. Запросите новое письмо на странице входа.',
    ok: false,
  },
};

/** Открывается по ссылке из письма: гасит токен и говорит, что получилось. */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? '';
  const result: VerifyResult = token ? await consumeVerifyToken(token) : 'invalid';
  const message = MESSAGES[result];

  return (
    <main className="dot-grid flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-[350px] text-center">
        <span
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-plate"
          style={{
            backgroundColor: message.ok ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.12)',
            color: message.ok ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {message.ok ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
        </span>

        <h1 className="mt-5 text-[19px] font-semibold leading-tight">{message.title}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-text-muted">{message.text}</p>

        <Link href="/login" className="btn-primary mt-7 w-full">
          Войти в {APP_NAME}
        </Link>
      </div>
    </main>
  );
}
