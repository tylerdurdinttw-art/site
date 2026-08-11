import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sanitizePermissions } from '@/lib/permissions';
import { generateInviteCode, toStaffRow } from '@/lib/project';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

export async function GET() {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const staff = await prisma.staff.findMany({
    where: { projectId },
    orderBy: { invitedAt: 'asc' },
  });

  return NextResponse.json({ staff: staff.map(toStaffRow) }, { headers: noStore });
}

/**
 * Приглашение сотрудника: имя и контакт. Права выдаются отдельным шагом.
 * Код из ответа человек вводит на /welcome или открывает ссылкой /invite/<код> —
 * этим он привязывает к записи свою учётку и попадает в проект.
 */
export async function POST(req: Request) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    contact?: string;
    permissions?: unknown;
  };

  const name = String(body.name ?? '').trim();
  if (name.length < 2 || name.length > 32) {
    return NextResponse.json({ error: 'имя: от 2 до 32 символов' }, { status: 400 });
  }

  const contact = String(body.contact ?? '').trim().slice(0, 64) || null;
  // Прав по умолчанию нет: их выдают отдельным шагом, осознанно.
  const permissions = sanitizePermissions(body.permissions);

  const created = await prisma.staff.create({
    data: {
      projectId,
      name,
      contact,
      permissions,
      inviteCode: generateInviteCode(),
    },
  });

  return NextResponse.json({ staff: toStaffRow(created) }, { headers: noStore });
}
