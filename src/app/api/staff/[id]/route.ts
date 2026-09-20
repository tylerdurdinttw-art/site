import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sanitizePermissions } from '@/lib/permissions';
import { canManageProjectUser, toStaffRow } from '@/lib/project';
import { COOWNER_ROLE } from '@/lib/projectShared';
import { isDeveloper } from '@/lib/devShared';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

/** Правка сотрудника: имя, контакт, набор прав и роль второго владельца. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  // Список сотрудников — часть группы «Проект»: она открыта владельцу и второму владельцу.
  if (!(await canManageProjectUser(projectId, ctx.user.id, ctx.user.login))) {
    return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
  }

  const staff = await prisma.staff.findFirst({ where: { id: params.id, projectId } });
  if (!staff) return NextResponse.json({ error: 'сотрудник не найден' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    contact?: string;
    permissions?: unknown;
    role?: unknown;
  };

  const data: {
    name?: string;
    contact?: string | null;
    permissions?: string[];
    role?: string;
  } = {};

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
    // Права владельца и второго владельца полные по определению: снять их нельзя,
    // иначе проект остался бы без того, кто может выдать их обратно.
    if (staff.role === 'owner' || staff.role === COOWNER_ROLE) {
      return NextResponse.json(
        { error: 'Права владельца проекта менять нельзя.' },
        { status: 409 },
      );
    }
    data.permissions = sanitizePermissions(body.permissions);
  }

  if (body.role !== undefined) {
    if (body.role !== COOWNER_ROLE && body.role !== 'moderator') {
      return NextResponse.json({ error: 'роль: coowner или moderator' }, { status: 400 });
    }
    if (staff.role === 'owner') {
      return NextResponse.json(
        { error: 'Роль создателя проекта менять нельзя.' },
        { status: 409 },
      );
    }
    // Передавать роль дальше может только сам создатель проекта: второму
    // владельцу такое право не переходит.
    const owner = await prisma.staff.findFirst({
      where: { projectId, role: 'owner' },
      select: { userId: true },
    });
    const isProjectOwner = Boolean(owner?.userId && owner.userId === ctx.user.id);
    if (!isProjectOwner && !isDeveloper(ctx.user.login)) {
      return NextResponse.json(
        { error: 'Второго владельца назначает только создатель проекта.' },
        { status: 403 },
      );
    }
    // Роль живёт у учётки: у непринятого приглашения её ещё нет.
    if (body.role === COOWNER_ROLE && !staff.userId) {
      return NextResponse.json(
        { error: 'Сотрудник ещё не принял приглашение.' },
        { status: 409 },
      );
    }

    data.role = body.role;
  }

  // Второй владелец в проекте один — прежнего разжалуем той же операцией.
  const updated = await prisma.$transaction(async (tx) => {
    if (data.role === COOWNER_ROLE) {
      await tx.staff.updateMany({
        where: { projectId, role: COOWNER_ROLE, id: { not: staff.id } },
        data: { role: 'moderator' },
      });
    }
    return tx.staff.update({ where: { id: staff.id }, data });
  });

  return NextResponse.json({ staff: toStaffRow(updated) }, { headers: noStore });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  if (!(await canManageProjectUser(projectId, ctx.user.id, ctx.user.login))) {
    return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
  }

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
