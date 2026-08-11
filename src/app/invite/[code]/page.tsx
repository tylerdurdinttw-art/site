import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { previewInvite } from '@/lib/project';
import AcceptInvite from '@/components/AcceptInvite';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ссылка приглашения из раздела «Сотрудники». Гостя requireUser уводит на вход
 * и возвращает сюда же, поэтому регистрация и приглашение не мешают друг другу.
 */
export default async function InvitePage({ params }: { params: { code: string } }) {
  const user = await requireUser();

  // Уже в проекте — принимать нечего: одна учётка работает в одном проекте.
  if (user.projectId) redirect('/');

  const invite = await previewInvite(params.code);

  return (
    <main className="dot-grid flex min-h-screen items-center justify-center px-4 py-16">
      <AcceptInvite code={params.code} invite={invite} />
    </main>
  );
}
