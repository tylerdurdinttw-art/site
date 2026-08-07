import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SINGLETON_PROJECT_ID, getProjectState } from '@/lib/project';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LOGO_BYTES = 10 * 1024 * 1024;
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif']);

/** Логотип проекта из базы. 404 — логотип не загружали, UI рисует заглушку. */
export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;

  const project = await prisma.project.findUnique({
    where: { id: SINGLETON_PROJECT_ID },
    select: { logo: true, logoType: true, updatedAt: true },
  });

  if (!project?.logo) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(project.logo), {
    headers: {
      'content-type': project.logoType ?? 'image/png',
      // Меняется редко, но при замене логотипа кеш должен слететь — отдаём как приватный.
      'cache-control': 'private, max-age=60',
    },
  });
}

/** Замена логотипа из раздела «Общее». Тело — multipart/form-data с полем logo. */
export async function POST(req: Request) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const project = await prisma.project.findUnique({ where: { id: SINGLETON_PROJECT_ID } });
  if (!project) return NextResponse.json({ error: 'проект не создан' }, { status: 404 });

  const form = await req.formData();
  const file = form.get('logo');

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'логотип: файл не передан' }, { status: 400 });
  }
  if (!LOGO_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'логотип: только PNG, JPEG или GIF' }, { status: 400 });
  }
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: 'логотип: не более 10MB' }, { status: 400 });
  }

  await prisma.project.update({
    where: { id: SINGLETON_PROJECT_ID },
    data: { logo: Buffer.from(await file.arrayBuffer()), logoType: file.type },
  });

  return NextResponse.json(
    { project: await getProjectState() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
