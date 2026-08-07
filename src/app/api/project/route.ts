import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  ONBOARDING_STEPS,
  SINGLETON_PROJECT_ID,
  getProjectState,
  slugify,
} from '@/lib/project';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LOGO_BYTES = 10 * 1024 * 1024;
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif']);

const noStore = { 'cache-control': 'no-store' };

/** Состояние проекта: по нему решается, куда пускать пользователя. */
export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;

  const state = await getProjectState();
  return NextResponse.json({ project: state }, { headers: noStore });
}

/**
 * Создание проекта — первый экран панели.
 * Тело приходит как multipart/form-data: name, slug и необязательный logo.
 */
export async function POST(req: Request) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const existing = await prisma.project.findUnique({ where: { id: SINGLETON_PROJECT_ID } });
  if (existing) {
    return NextResponse.json({ error: 'проект уже создан' }, { status: 409 });
  }

  const form = await req.formData();
  const name = String(form.get('name') ?? '').trim();
  const slug = slugify(String(form.get('slug') ?? '') || name);

  if (name.length < 2 || name.length > 48) {
    return NextResponse.json({ error: 'название: от 2 до 48 символов' }, { status: 400 });
  }
  if (!slug) {
    return NextResponse.json(
      { error: 'ссылка: нужны латиница или цифры' },
      { status: 400 },
    );
  }

  let logo: Buffer | null = null;
  let logoType: string | null = null;

  const file = form.get('logo');
  if (file instanceof File && file.size > 0) {
    if (!LOGO_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'логотип: только PNG, JPEG или GIF' }, { status: 400 });
    }
    if (file.size > MAX_LOGO_BYTES) {
      return NextResponse.json({ error: 'логотип: не более 10MB' }, { status: 400 });
    }
    logo = Buffer.from(await file.arrayBuffer());
    logoType = file.type;
  }

  await prisma.project.create({
    data: { id: SINGLETON_PROJECT_ID, name, slug, logo, logoType },
  });

  const state = await getProjectState();
  return NextResponse.json({ project: state }, { headers: noStore });
}

/**
 * Прогресс онбординга и выбор тарифа.
 * `step` только растёт: вернуться назад по цепочке нельзя, шаги уже выполнены.
 */
export async function PATCH(req: Request) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const project = await prisma.project.findUnique({ where: { id: SINGLETON_PROJECT_ID } });
  if (!project) return NextResponse.json({ error: 'проект не создан' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    step?: number;
    done?: boolean;
    name?: string;
    slug?: string;
  };

  const data: {
    onboardingStep?: number;
    onboardingDone?: boolean;
    name?: string;
    slug?: string;
  } = {};

  if (typeof body.step === 'number' && Number.isFinite(body.step)) {
    const step = Math.min(ONBOARDING_STEPS, Math.max(0, Math.trunc(body.step)));
    if (step > project.onboardingStep) data.onboardingStep = step;
  }
  if (body.done === true) {
    data.onboardingDone = true;
    data.onboardingStep = ONBOARDING_STEPS;
  }
  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (name.length < 2 || name.length > 48) {
      return NextResponse.json({ error: 'название: от 2 до 48 символов' }, { status: 400 });
    }
    data.name = name;
  }
  // Ссылку меняют в разделе «Общее»; slug уникален, поэтому занятый адрес — ошибка.
  if (typeof body.slug === 'string') {
    const slug = slugify(body.slug);
    if (!slug) {
      return NextResponse.json({ error: 'ссылка: нужны латиница или цифры' }, { status: 400 });
    }
    if (slug !== project.slug) {
      const taken = await prisma.project.findUnique({ where: { slug } });
      if (taken) {
        return NextResponse.json({ error: 'такая ссылка уже занята' }, { status: 409 });
      }
      data.slug = slug;
    }
  }

  if (Object.keys(data).length > 0) {
    await prisma.project.update({ where: { id: SINGLETON_PROJECT_ID }, data });
  }

  const state = await getProjectState();
  return NextResponse.json({ project: state }, { headers: noStore });
}
