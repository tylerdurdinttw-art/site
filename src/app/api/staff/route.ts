import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sanitizePermissions } from '@/lib/permissions';
import { SINGLETON_PROJECT_ID, generateInviteCode, toStaffRow } from '@/lib/project';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;

  const staff = await prisma.staff.findMany({
    where: { projectId: SINGLETON_PROJECT_ID },
    orderBy: { invitedAt: 'asc' },
  });

  return NextResponse.json({ staff: staff.map(toStaffRow) }, { headers: noStore });
}

/** Приглашение модератора: имя и контакт. Права выдаются отдельным шагом. */
export async function POST(req: Request) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const project = await prisma.project.findUnique({ where: { id: SINGLETON_PROJECT_ID } });
  if (!project) return NextResponse.json({ error: 'проект не создан' }, { status: 404 });

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
      projectId: SINGLETON_PROJECT_ID,
      name,
      contact,
      permissions,
      inviteCode: generateInviteCode(),
    },
  });

  return NextResponse.json({ staff: toStaffRow(created) }, { headers: noStore });
}
