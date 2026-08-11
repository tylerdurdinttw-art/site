/**
 * Разовый перенос однопроектной базы на мультипроектную.
 *
 * До этой версии проект был один, с фиксированным id "default", а учётки о нём
 * ничего не знали. После неё проект выбирается пользователем, поэтому старым
 * учёткам нужно проставить его явно — иначе панель встретит их экраном
 * «создайте проект», хотя проект давно есть.
 *
 * Первую по времени учётку делаем владельцем, остальных — сотрудниками.
 * Запускать один раз после `prisma db push`:
 *   npx tsx scripts/adopt-legacy-project.ts
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LEGACY_PROJECT_ID = 'default';

const ALL_PERMISSIONS = [
  'check',
  'ban',
  'unban',
  'mute',
  'kick',
  'chat',
  'reports',
  'servers',
  'settings',
];

function inviteCode(): string {
  return randomBytes(9).toString('base64url');
}

async function main() {
  const project = await prisma.project.findUnique({ where: { id: LEGACY_PROJECT_ID } });
  if (!project) {
    console.log(`Проекта "${LEGACY_PROJECT_ID}" нет — переносить нечего.`);
    return;
  }

  const orphans = await prisma.user.findMany({
    where: { projectId: null },
    orderBy: { createdAt: 'asc' },
  });

  if (orphans.length === 0) {
    console.log('Все учётки уже привязаны к проектам.');
    return;
  }

  // Владелец уже мог появиться — тогда второй раз его не назначаем.
  const hasOwner =
    (await prisma.staff.count({ where: { projectId: project.id, role: 'owner' } })) > 0;

  for (const [index, user] of orphans.entries()) {
    const owner = !hasOwner && index === 0;

    await prisma.user.update({
      where: { id: user.id },
      data: { projectId: project.id, role: owner ? 'owner' : 'moderator' },
    });

    const existing = await prisma.staff.findUnique({ where: { userId: user.id } });
    if (!existing) {
      await prisma.staff.create({
        data: {
          projectId: project.id,
          userId: user.id,
          name: user.login,
          role: owner ? 'owner' : 'moderator',
          permissions: owner ? ALL_PERMISSIONS : [],
          inviteCode: inviteCode(),
          acceptedAt: new Date(),
        },
      });
    }

    console.log(`${user.login} -> ${project.name} (${owner ? 'владелец' : 'сотрудник'})`);
  }

  console.log(`Готово: перенесено учёток — ${orphans.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
