import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LOGIN_COOKIE } from '@/lib/authShared';
import { getCurrentUser, signupAllowed } from '@/lib/auth';
import AuthForm from '@/components/AuthForm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Вход и регистрация. Вошедшему тут делать нечего — уводим в панель. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  // Возвращаем только на внутренний путь: «//evil.com» из адресной строки сюда не пролезет.
  const next =
    searchParams.next && /^\/(?!\/)/.test(searchParams.next) ? searchParams.next : '/';

  if (await getCurrentUser()) redirect(next);

  return (
    <main className="dot-grid flex min-h-screen items-center justify-center px-4 py-16">
      <AuthForm
        rememberedLogin={cookies().get(LOGIN_COOKIE)?.value ?? ''}
        signupOpen={await signupAllowed()}
        next={next}
      />
    </main>
  );
}
