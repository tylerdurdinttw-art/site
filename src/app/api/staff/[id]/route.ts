import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sanitizePermissions } from '@/lib/permissions';
import { toStaffRow } from '@/lib/project';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

/** Правка сотрудника: имя, контакт и набор прав. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const staff = await prisma.staff.findUnique({ where: { id: params.id } });
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
    data.permissions = sanitizePermissions(body.permissions);
  }

  const updated = await prisma.staff.update({ where: { id: staff.id }, data });
  return NextResponse.json({ staff: toStaffRow(updated) }, { headers: noStore });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const staff = await prisma.staff.findUnique({ where: { id: params.id } });
  if (!staff) return NextResponse.json({ error: 'сотрудник не найден' }, { status: 404 });

  await prisma.staff.delete({ where: { id: staff.id } });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
