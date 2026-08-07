'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Eye, EyeOff, MailCheck } from 'lucide-react';
import { APP_NAME } from '@/lib/brand';
import { checkEmail, checkLogin, checkPassword } from '@/lib/authShared';

type Mode = 'login' | 'register';

/** Экран, который показывается после регистрации вместо формы. */
interface Sent {
  email: string;
  mailSent: boolean;
  /** Заполнена, только когда SMTP не настроен: подтвердить иначе нечем. */
  verifyUrl?: string;
}

function Field({
  id,
  label,
  ...props
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="text-[12px] text-text-muted">
        {label}
      </label>
      <input id={id} className="field mt-1.5" {...props} />
    </div>
  );
}

function PasswordField({
  id,
  name,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const [shown, setShown] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="text-[12px] text-text-muted">
        {label}
      </label>
      <div className="field mt-1.5 flex items-center gap-2 py-0 pr-2">
        <input
          id={id}
          name={name}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder="••••••••"
          className="min-w-0 flex-1 bg-transparent py-[10px] text-[13px] text-text outline-none placeholder:text-text-dim"
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? 'Скрыть пароль' : 'Показать пароль'}
          className="shrink-0 text-text-dim transition-colors hover:text-text"
        >
          {shown ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}

/**
 * Вход и регистрация одной формой.
 *
 * `rememberedLogin` приходит из куки qp_login — её ставит вход с галочкой
 * «запомнить меня», поэтому поле логина уже заполнено.
 */
export default function AuthForm({
  rememberedLogin,
  signupOpen,
  next,
}: {
  rememberedLogin: string;
  signupOpen: boolean;
  /** Куда вернуть после входа — путь, с которого middleware увело на эту страницу. */
  next: string;
}) {
  const [mode, setMode] = useState<Mode>('login');
  const [login, setLogin] = useState(rememberedLogin);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(Boolean(rememberedLogin));

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  /** Почта учётки, которой не хватает подтверждения — под неё показывается «выслать ещё раз». */
  const [unverified, setUnverified] = useState<string | null>(null);
  /** Ссылка подтверждения, когда SMTP не настроен и письму взяться неоткуда. */
  const [manualVerify, setManualVerify] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  /**
   * Что реально введено в полях.
   *
   * Автозаполнение браузера подставляет значения прямо в DOM, не поднимая событий,
   * которые видит React: состояние остаётся пустым, хотя на экране всё заполнено.
   * Поэтому источником истины при отправке служит сама форма, а состояние —
   * запасным вариантом.
   */
  const readFields = useCallback(() => {
    const data = formRef.current ? new FormData(formRef.current) : null;
    const pick = (name: string, fallback: string) => {
      const value = data?.get(name);
      return typeof value === 'string' && value ? value : fallback;
    };

    return {
      login: pick('login', login).trim(),
      email: pick('email', email).trim(),
      password: pick('password', password),
    };
  }, [login, email, password]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setUnverified(null);
    setManualVerify(null);
  };

  const submit = useCallback(async () => {
    if (busy) return;

    const fields = readFields();

    // Проверяем при отправке, а не блокировкой кнопки: заблокированная кнопка
    // на автозаполненной форме выглядит как сломанная — жмёшь, и ничего.
    if (mode === 'login') {
      if (!fields.login || !fields.password) {
        setError('Введите логин и пароль.');
        return;
      }
    } else {
      const problem =
        checkLogin(fields.login) ?? checkEmail(fields.email) ?? checkPassword(fields.password);
      if (problem) {
        setError(problem);
        return;
      }
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    setUnverified(null);
    setManualVerify(null);

    try {
      const url = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        mode === 'login'
          ? { login: fields.login, password: fields.password, remember }
          : { login: fields.login, email: fields.email, password: fields.password };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        error?: string;
        needVerify?: boolean;
        email?: string;
        mailSent?: boolean;
        verifyUrl?: string;
      };

      if (!res.ok) {
        setError(body.error ?? 'Не получилось. Попробуйте ещё раз.');
        if (body.needVerify && body.email) setUnverified(body.email);
        // Пароль сошёлся, но почта не подтверждена: сервер приложил рабочую
        // ссылку, если отправить письмо ему нечем.
        if (body.verifyUrl) setManualVerify(body.verifyUrl);
        return;
      }

      if (mode === 'register') {
        setSent({
          email: body.email ?? fields.email,
          mailSent: Boolean(body.mailSent),
          verifyUrl: body.verifyUrl,
        });
        return;
      }

      // Полная перезагрузка, а не router.replace: клиентский кеш роутера мог
      // запомнить, что «/» уводит на /login (middleware отправляло туда гостя),
      // и после входа отдал бы этот же ответ — внешне «кнопка ничего не делает».
      // Заодно сервер отрисовывает сайдбар и разделы сразу с новой сессией.
      window.location.assign(next);
      return;
    } catch (err) {
      console.error(err);
      setError('Панель не отвечает. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }, [busy, mode, readFields, remember, next]);

  const resend = useCallback(async (address: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/auth/resend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: address }),
      });
      const body = (await res.json()) as { verifyUrl?: string };

      // Новый токен погасил предыдущий — подменяем показанную ссылку на свежую,
      // иначе пользователь кликнет по уже мёртвой.
      if (body.verifyUrl) {
        setManualVerify(body.verifyUrl);
        setSent((prev) => (prev ? { ...prev, verifyUrl: body.verifyUrl } : prev));
        setNotice('Письмо отправить нечем — воспользуйтесь ссылкой ниже.');
      } else {
        setNotice('Если аккаунт существует, письмо отправлено ещё раз.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  }, []);

  /* ---------- после регистрации ---------- */

  if (sent) {
    return (
      <div className="w-full max-w-[350px]">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-plate"
          style={{ backgroundColor: 'rgba(59,130,246,0.14)', color: 'var(--accent)' }}
        >
          <MailCheck size={24} />
        </span>

        <h1 className="mt-5 text-[19px] font-semibold leading-tight">Проверьте почту</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
          Мы отправили письмо на <span className="text-text">{sent.email}</span>. Откройте ссылку из
          него — после этого можно войти. Ссылка действует 24 часа.
        </p>

        {!sent.mailSent && (
          <div
            className="mt-4 rounded-control px-3 py-2.5 text-[12px] leading-relaxed"
            style={{ backgroundColor: 'rgba(234,179,8,0.12)', color: 'var(--warning)' }}
          >
            Почтовый сервер не настроен, письмо не ушло.
            {sent.verifyUrl && (
              <>
                {' '}
                <Link href={sent.verifyUrl} className="underline underline-offset-2">
                  Подтвердить вручную
                </Link>
                .
              </>
            )}
          </div>
        )}

        {notice && <p className="mt-4 text-[12px] text-text-muted">{notice}</p>}

        <div className="mt-6 flex items-stretch gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void resend(sent.email)}
            className="btn-ghost flex-1"
          >
            Выслать ещё раз
          </button>
          <button
            type="button"
            onClick={() => {
              setSent(null);
              switchMode('login');
              setPassword('');
            }}
            className="btn-primary flex-1"
          >
            Войти
          </button>
        </div>
      </div>
    );
  }

  /* ---------- форма ---------- */

  const isLogin = mode === 'login';

  return (
    <div className="w-full max-w-[350px]">
      <h1 className="text-[19px] font-semibold leading-tight">
        {isLogin ? `Вход в ${APP_NAME}` : 'Создать аккаунт'}
      </h1>
      <p className="mt-1 text-[13px] text-text-muted">
        {isLogin ? 'Введите данные вашей учётной записи' : 'Займёт меньше минуты'}
      </p>

      <form
        ref={formRef}
        className="mt-7 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field
          id="auth-login"
          name="login"
          label={isLogin ? 'Логин или почта' : 'Логин'}
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder={isLogin ? 'admin' : 'admin'}
          maxLength={190}
          autoComplete={isLogin ? 'username' : 'off'}
          autoFocus={!rememberedLogin}
        />

        {!isLogin && (
          <Field
            id="auth-email"
            name="email"
            label="Почта"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            maxLength={190}
            autoComplete="email"
          />
        )}

        <PasswordField
          id="auth-password"
          name="password"
          label="Пароль"
          value={password}
          onChange={setPassword}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
        />

        {!isLogin && (
          <p className="text-[11px] leading-relaxed text-text-dim">
            Не короче 8 символов, буквы и цифры.
          </p>
        )}

        {isLogin && (
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-text-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="sr-only"
            />
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                remember ? 'border-transparent bg-accent text-white' : 'border-border-strong'
              }`}
            >
              {remember && <Check size={11} />}
            </span>
            Запомнить меня на 30 дней
          </label>
        )}

        {error && (
          <div
            className="rounded-control px-3 py-2 text-[12px] leading-relaxed"
            style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }}
          >
            {error}
            {unverified && !manualVerify && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => void resend(unverified)}
                  className="underline underline-offset-2"
                >
                  Выслать письмо ещё раз
                </button>
              </>
            )}
          </div>
        )}

        {manualVerify && (
          <div
            className="rounded-control px-3 py-2.5 text-[12px] leading-relaxed"
            style={{ backgroundColor: 'rgba(234,179,8,0.12)', color: 'var(--warning)' }}
          >
            Почтовый сервер не настроен, письмо отправить нечем.{' '}
            <Link href={manualVerify} className="underline underline-offset-2">
              Подтвердить почту вручную
            </Link>
            .
          </div>
        )}

        {notice && <p className="text-[12px] text-text-muted">{notice}</p>}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Секунду…' : isLogin ? 'Войти' : 'Зарегистрироваться'}
        </button>
      </form>

      {signupOpen ? (
        <p className="mt-5 text-center text-[13px] text-text-muted">
          {isLogin ? 'Ещё нет аккаунта?' : 'Уже есть аккаунт?'}{' '}
          <button
            type="button"
            onClick={() => switchMode(isLogin ? 'register' : 'login')}
            className="text-text underline decoration-border-strong underline-offset-2 transition-colors hover:decoration-text"
          >
            {isLogin ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </p>
      ) : (
        <p className="mt-5 text-center text-[12px] text-text-dim">
          Регистрация закрыта — доступ выдаёт владелец панели.
        </p>
      )}
    </div>
  );
}
