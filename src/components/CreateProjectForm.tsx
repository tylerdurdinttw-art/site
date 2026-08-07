'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera } from 'lucide-react';
import { PROJECT_URL_PREFIX } from '@/lib/brand';
import { slugify } from '@/lib/projectShared';

const MAX_LOGO_BYTES = 10 * 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/gif'];

/**
 * Экран создания проекта. Ссылка подставляется из названия, пока её не тронули руками:
 * так «Null Rust» сразу превращается в quickpanel.com/nullrust.
 */
export default function CreateProjectForm() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const effectiveSlug = slugTouched ? slug : slugify(name);
  const valid = name.trim().length >= 2 && effectiveSlug.length > 0;

  // Превью логотипа живёт на blob-ссылке — её нужно освобождать.
  useEffect(() => {
    if (!logo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(logo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  const pickLogo = useCallback((file: File | null) => {
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      setError('Логотип: только PNG, JPEG или GIF.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError('Логотип: файл больше 10MB.');
      return;
    }
    setError(null);
    setLogo(file);
  }, []);

  const submit = useCallback(async () => {
    if (!valid || sending) return;
    setSending(true);
    setError(null);

    try {
      const form = new FormData();
      form.set('name', name.trim());
      form.set('slug', effectiveSlug);
      if (logo) form.set('logo', logo);

      const res = await fetch('/api/project', { method: 'POST', body: form });
      const body = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(body.error ?? 'Не удалось создать проект.');
        return;
      }

      router.replace('/start');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Панель не отвечает. Попробуйте ещё раз.');
    } finally {
      setSending(false);
    }
  }, [valid, sending, name, effectiveSlug, logo, router]);

  const logoNode = useMemo(() => {
    if (preview) {
      // Локальный blob, next/image здесь только мешает.
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={preview} alt="" className="h-full w-full rounded-plate object-cover" />;
    }
    return <Camera size={18} className="text-text-muted" />;
  }, [preview]);

  return (
    <div className="w-full max-w-[350px]">
      <h1 className="text-[19px] font-semibold leading-tight">Создать проект</h1>
      <p className="mt-1 text-[13px] text-text-muted">Приступим к созданию вашего проекта</p>

      <form
        className="mt-7 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <label htmlFor="project-name" className="text-[12px] text-text-muted">
            Название
          </label>
          <input
            id="project-name"
            className="field mt-1.5"
            placeholder="Null Rust"
            maxLength={48}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="project-slug" className="text-[12px] text-text-muted">
            Ссылка
          </label>
          <div className="field mt-1.5 flex items-center gap-0 py-0 pr-0">
            <span className="shrink-0 py-[10px] text-[13px] text-text">{PROJECT_URL_PREFIX}</span>
            <input
              id="project-slug"
              className="min-w-0 flex-1 bg-transparent py-[10px] text-[13px] text-text-muted outline-none placeholder:text-text-dim"
              placeholder="nullrust"
              maxLength={32}
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              autoComplete="off"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-plate border border-dashed border-border-strong px-4 py-4 text-left transition-colors hover:bg-surface"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-plate bg-surface-hover">
            {logoNode}
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold">
              {logo ? logo.name : 'Загрузите логотип проекта'}
            </span>
            <span className="block text-[12px] text-text-muted">
              PNG, JPEG или GIF (не более 10MB)
            </span>
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={LOGO_TYPES.join(',')}
          className="hidden"
          onChange={(e) => pickLogo(e.target.files?.[0] ?? null)}
        />

        {error && (
          <div
            className="rounded-control px-3 py-2 text-[12px]"
            style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }}
          >
            {error}
          </div>
        )}

        <div className="flex items-stretch gap-2 pt-1">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Назад"
            className="btn-ghost w-11 shrink-0 px-0"
          >
            <ArrowLeft size={16} />
          </button>
          <button type="submit" disabled={!valid || sending} className="btn-primary flex-1">
            {sending ? 'Создаём…' : 'Продолжить'}
          </button>
        </div>
      </form>

      <p className="mt-5 text-[12px] leading-relaxed text-text-muted">
        Создавая проект, вы подтверждаете своё согласие с{' '}
        <span className="cursor-default underline decoration-border-strong underline-offset-2">
          User Agreement
        </span>{' '}
        и{' '}
        <span className="cursor-default underline decoration-border-strong underline-offset-2">
          Privacy Policy
        </span>
        .
      </p>
    </div>
  );
}
