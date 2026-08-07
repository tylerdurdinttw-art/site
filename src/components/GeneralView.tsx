'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy } from 'lucide-react';
import { Row, Section, SettingsPage } from '@/components/SettingsControls';
import { PROJECT_URL_PREFIX } from '@/lib/brand';
import { slugify, type ProjectState } from '@/lib/projectShared';

/**
 * Раздел «Общее»: название, ссылка и логотип проекта.
 * Поля сохраняются по уходу фокуса — отдельной кнопки «Сохранить» в макете нет.
 */
export default function GeneralView({ project }: { project: ProjectState }) {
  const router = useRouter();

  const [name, setName] = useState(project.name);
  const [slug, setSlug] = useState(project.slug);
  const [hasLogo, setHasLogo] = useState(project.hasLogo);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Меняется после загрузки логотипа: без этого браузер покажет картинку из кеша.
  const [logoVersion, setLogoVersion] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(project.name);
    setSlug(project.slug);
    setHasLogo(project.hasLogo);
  }, [project.name, project.slug, project.hasLogo]);

  const save = useCallback(
    async (patch: { name?: string; slug?: string }) => {
      setError(null);
      try {
        const res = await fetch('/api/project', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const body = (await res.json()) as { error?: string; project?: ProjectState };
        if (!res.ok || !body.project) {
          setError(body.error ?? 'Не удалось сохранить изменения.');
          // Возвращаем поля к тому, что реально лежит в базе.
          setName(project.name);
          setSlug(project.slug);
          return;
        }
        setName(body.project.name);
        setSlug(body.project.slug);
        // Название видно в сайдбаре — он рисуется на сервере, поэтому обновляем страницу.
        router.refresh();
      } catch (err) {
        console.error(err);
        setError('Панель недоступна — изменения не сохранены.');
      }
    },
    [project.name, project.slug, router],
  );

  const uploadLogo = useCallback(
    async (file: File) => {
      setError(null);
      const form = new FormData();
      form.append('logo', file);

      try {
        const res = await fetch('/api/project/logo', { method: 'POST', body: form });
        const body = (await res.json()) as { error?: string; project?: ProjectState };
        if (!res.ok || !body.project) {
          setError(body.error ?? 'Не удалось загрузить логотип.');
          return;
        }
        setHasLogo(true);
        setLogoVersion((v) => v + 1);
        router.refresh();
      } catch (err) {
        console.error(err);
        setError('Панель недоступна — логотип не загружен.');
      }
    },
    [router],
  );

  const copyId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(String(project.publicId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  }, [project.publicId]);

  return (
    <SettingsPage title="Настройки проекта" note="Основная информация и параметры идентификации">
      {error && (
        <div
          className="rounded-plate px-4 py-3 text-[13px]"
          style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }}
        >
          {error}
        </div>
      )}

      <Section title="Общее">
        <Row
          label="Логотип"
          control={
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadLogo(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title="Заменить логотип"
                aria-label="Заменить логотип"
                className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-surface-hover transition-opacity hover:opacity-80"
              >
                {hasLogo ? (
                  // Логотип отдаётся своим эндпоинтом из базы — оптимизатор next/image не нужен.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/project/logo?v=${logoVersion}`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-[12px] font-semibold text-text-muted">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </button>
            </>
          }
        />

        <Row
          label="Название"
          control={
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                const next = name.trim();
                if (next && next !== project.name) void save({ name: next });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              maxLength={48}
              aria-label="Название проекта"
              className="w-[240px] rounded-control border border-border bg-surface-hover px-3 py-2 text-[13px] outline-none focus:border-border-strong"
            />
          }
        />

        <Row
          label="Ссылка"
          control={
            <div className="flex w-[240px] items-center rounded-control border border-border bg-surface-hover px-3 py-2 focus-within:border-border-strong">
              <span className="shrink-0 text-[13px] text-text-dim">{PROJECT_URL_PREFIX}</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                onBlur={() => {
                  const next = slugify(slug);
                  if (next && next !== project.slug) void save({ slug: next });
                  else setSlug(project.slug);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                maxLength={32}
                aria-label="Ссылка проекта"
                className="min-w-0 flex-1 bg-transparent text-[13px] font-medium outline-none"
              />
            </div>
          }
        />

        <Row
          label="ID проекта"
          control={
            <span className="inline-flex items-center gap-2 text-[13px] text-text-muted">
              {project.publicId}
              <button
                type="button"
                onClick={() => void copyId()}
                aria-label="Скопировать ID проекта"
                className="text-text-dim transition-colors hover:text-text"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </span>
          }
        />
      </Section>
    </SettingsPage>
  );
}
