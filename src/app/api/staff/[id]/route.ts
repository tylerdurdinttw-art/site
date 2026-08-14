import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sanitizePermissions } from '@/lib/permissions';
import { toStaffRow } from '@/lib/project';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

/** Правка сотрудника: имя, контакт и набор прав. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const staff = await prisma.staff.findFirst({ where: { id: params.id, projectId } });
  if (!staff) return NextResponse.json({ error: 'сотрудник не найден' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    contact?: string;
    permissions?: unknown;
  };

  const data: { name?: string; contact?: string | null; permissions?: string[] } = {};

  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (name.length < 2 || name.length > 32) {
      return NextResponse.json({ error: 'имя: от 2 до 32 символов' }, { status: 400 });
    }
    data.name = name;
  }
  if (typeof body.contact === 'string') {
    data.contact = body.contact.trim().slice(0, 64) || null;
  }
  if (body.permissions !== undefined) {
    // Права владельца полные по определению: снять их нельзя даже ему самому,
    // иначе проект остался бы без того, кто может выдать их обратно.
    if (staff.role === 'owner') {
      return NextResponse.json(
        { error: 'Права владельца проекта менять нельзя.' },
        { status: 409 },
      );
    }
    data.permissions = sanitizePermissions(body.permissions);
  }

  const updated = await prisma.staff.update({ where: { id: staff.id }, data });
  return NextResponse.json({ staff: toStaffRow(updated) }, { headers: noStore });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const staff = await prisma.staff.findFirst({ where: { id: params.id, projectId } });
  if (!staff) return NextResponse.json({ error: 'сотрудник не найден' }, { status: 404 });

  // Владелец — единственный, кого нельзя убрать: проект остался бы без хозяина.
  if (staff.role === 'owner') {
    return NextResponse.json({ error: 'Владельца проекта убрать нельзя.' }, { status: 409 });
  }

  await prisma.staff.delete({ where: { id: staff.id } });

  // Если приглашением уже пользовались, человека нужно и из проекта вывести,
  // иначе он останется в панели с правами удалённой записи.
  if (staff.userId) {
    await prisma.user.update({ where: { id: staff.userId }, data: { projectId: null } });
  }

  return NextResponse.json({ ok: true }, { headers: noStore });
}
