'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import RenewView from '@/components/RenewView';
import type { SessionUser } from '@/lib/authShared';
import type { ProjectState } from '@/lib/projectShared';
import { isDeveloper } from '@/lib/devShared';

/**
 * Оболочка рабочих разделов. Пока онбординг не закрыт, доступен только «Начало работы»:
 * остальные пункты сайдбара уводят обратно на цепочку шагов.
 *
 * Кончился оплаченный срок — вместо любого раздела показывается «Продление».
 * Редиректа здесь нет намеренно: он зациклился бы на самой странице продления.
 *
 * Исключение — «Разработка»: она про сайт, а не про проект, и должна открываться
 * даже с закрытым доступом. Иначе разработчик с истёкшим сроком не смог бы
 * продлить его самому себе.
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

  const devArea = isDeveloper(user.login) && pathname === '/dev';
  const expired = !project.access.active && !devArea;
  const locked = !expired && !devArea && !project.done && pathname !== '/start';

  useEffect(() => {
    if (locked) router.replace('/start');
  }, [locked, router]);

  return (
    <div className="flex min-h-screen">
      {/* Сайдбару важен сам срок, а не поблажка для «Разработки»: остальные пункты
          при закрытом доступе должны оставаться погашенными и на ней. */}
      <Sidebar project={project} user={user} expired={!project.access.active} />
      <main className="h-screen flex-1 overflow-y-auto scrollbar-thin">
        {expired ? <RenewView project={project} /> : locked ? null : children}
      </main>
    </div>
  );
}
