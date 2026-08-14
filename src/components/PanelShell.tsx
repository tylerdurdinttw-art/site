'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import RenewView from '@/components/RenewView';
import type { SessionUser } from '@/lib/authShared';
import type { ProjectState } from '@/lib/projectShared';

/**
 * Оболочка рабочих разделов. Пока онбординг не закрыт, доступен только «Начало работы»:
 * остальные пункты сайдбара уводят обратно на цепочку шагов.
 *
 * Кончился оплаченный срок — вместо любого раздела показывается «Продление».
 * Редиректа здесь нет намеренно: он зациклился бы на самой странице продления.
 */
export default function PanelShell({
  project,
  user,
  children,
}: {
  project: ProjectState;
  user: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const expired = !project.access.active;
  const locked = !expired && !project.done && pathname !== '/start';

  useEffect(() => {
    if (locked) router.replace('/start');
  }, [locked, router]);

  return (
    <div className="flex min-h-screen">
      <Sidebar project={project} user={user} expired={expired} />
      <main className="h-screen flex-1 overflow-y-auto scrollbar-thin">
        {expired ? <RenewView project={project} /> : locked ? null : children}
      </main>
    </div>
  );
}
