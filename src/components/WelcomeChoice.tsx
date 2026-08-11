'use client';

import { useState } from 'react';
import { FolderPlus, Users } from 'lucide-react';
import CreateProjectForm from '@/components/CreateProjectForm';
import JoinProjectForm from '@/components/JoinProjectForm';

type Mode = 'choice' | 'create' | 'join';

/**
 * Первый экран после подтверждения почты. Пока человек не выбрал проект,
 * панель показывать нечего: у неё нет ни серверов, ни игроков — они у проекта.
 */
export default function WelcomeChoice({ login }: { login: string }) {
  const [mode, setMode] = useState<Mode>('choice');

  if (mode === 'create') return <CreateProjectForm onBack={() => setMode('choice')} />;
  if (mode === 'join') return <JoinProjectForm onBack={() => setMode('choice')} />;

  return (
    <div className="w-full max-w-[400px]">
      <h1 className="text-[19px] font-semibold leading-tight">Здравствуйте, {login}</h1>
      <p className="mt-1 text-[13px] text-text-muted">
        Заведите свой проект или присоединитесь к чужому — тем, кого уже позвали работать.
      </p>

      <div className="mt-7 space-y-3">
        <Option
          icon={<FolderPlus size={18} />}
          title="Создать проект"
          hint="Подключите свои серверы и позовите модераторов. Вы станете владельцем."
          onClick={() => setMode('create')}
        />
        <Option
          icon={<Users size={18} />}
          title="Подключиться к готовому проекту"
          hint="Нужен код приглашения — его выдаёт владелец в разделе «Сотрудники»."
          onClick={() => setMode('join')}
        />
      </div>
    </div>
  );
}

function Option({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3.5 rounded-plate border border-border bg-surface px-4 py-4 text-left transition-colors hover:border-border-strong hover:bg-surface-hover"
    >
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-plate bg-surface-hover text-text-muted">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-text-muted">{hint}</span>
      </span>
    </button>
  );
}
