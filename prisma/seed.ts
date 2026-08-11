import { PrismaClient, type ClientType, type PlayerStatus } from '@prisma/client';

const prisma = new PrismaClient();

const PROJECT_SLUG = 'demo';
const SERVER_ID = 'rust-1';
const SERVER_NAME = 'Rust #1 [ X1000000 | NOLIMIT ]';

const SERVER_2_ID = 'rust-2';
const SERVER_2_NAME = 'Rust #2 [ X100 | BARREN ]';

interface SeedPlayer {
  steamId: string;
  name: string;
  clientType: ClientType;
  status: PlayerStatus;
  serverId: string;
  ip: string;
  ping: number;
  isAfk: boolean;
  reportsCount: number;
  minutesAgo: number;
  isp: string;
  city: string;
  country: string;
}

const players: SeedPlayer[] = [
  {
    steamId: '76561198403377516',
    name: 'GubaRazbita',
    clientType: 'licensed',
    status: 'online',
    serverId: SERVER_ID,
    ip: '80.80.197.134',
    ping: 54,
    isAfk: false,
    reportsCount: 0,
    minutesAgo: 0,
    isp: 'PJSC Rostelecom',
    city: 'Москва',
    country: 'Россия',
  },
  {
    steamId: '76561199104420031',
    name: 'Мален Кийчлен',
    clientType: 'licensed',
    status: 'online',
    serverId: SERVER_ID,
    ip: '31.173.82.19',
    ping: 78,
    isAfk: true,
    reportsCount: 2,
    minutesAgo: 0,
    isp: 'MegaFon',
    city: 'Санкт-Петербург',
    country: 'Россия',
  },
  {
    steamId: '76561198077412990',
    name: 'OLD SANTY',
    clientType: 'licensed',
    status: 'sleeping',
    serverId: SERVER_ID,
    ip: '178.176.74.203',
    ping: 96,
    isAfk: false,
    reportsCount: 5,
    minutesAgo: 12,
    isp: 'MTS PJSC',
    city: 'Казань',
    country: 'Россия',
  },
  {
    steamId: '76561199523118804',
    name: 'mash_kun1',
    clientType: 'pirate',
    status: 'online',
    serverId: SERVER_ID,
    ip: '46.211.90.7',
    ping: 143,
    isAfk: false,
    reportsCount: 1,
    minutesAgo: 0,
    isp: 'Kyivstar PJSC',
    city: 'Киев',
    country: 'Украина',
  },
  {
    steamId: '76561198812004417',
    name: 'Barik.Jr',
    clientType: 'pirate',
    status: 'online',
    serverId: SERVER_2_ID,
    ip: '46.211.90.7',
    ping: 187,
    isAfk: false,
    reportsCount: 7,
    minutesAgo: 0,
    isp: 'Kyivstar PJSC',
    city: 'Киев',
    country: 'Украина',
  },
  {
    steamId: '76561198220017743',
    name: 'ЧёрныйПлащ',
    clientType: 'licensed',
    status: 'sleeping',
    serverId: SERVER_ID,
    ip: '95.24.118.66',
    ping: 61,
    isAfk: false,
    reportsCount: 0,
    minutesAgo: 40,
    isp: 'Rostelecom',
    city: 'Новосибирск',
    country: 'Россия',
  },
  {
    steamId: '76561199017736201',
    name: 'nexy_',
    clientType: 'pirate',
    status: 'offline',
    serverId: SERVER_2_ID,
    ip: '188.191.44.12',
    ping: 0,
    isAfk: false,
    reportsCount: 3,
    minutesAgo: 320,
    isp: 'Beeline',
    city: 'Минск',
    country: 'Беларусь',
  },
  {
    steamId: '76561198334509182',
    name: 'Kolya Sudokoff',
    clientType: 'licensed',
    status: 'online',
    serverId: SERVER_2_ID,
    ip: '5.18.240.91',
    ping: 44,
    isAfk: false,
    reportsCount: 0,
    minutesAgo: 0,
    isp: 'ER-Telecom',
    city: 'Пермь',
    country: 'Россия',
  },
  {
    steamId: '76561199289940017',
    name: 'sanya_dvacher',
    clientType: 'pirate',
    status: 'offline',
    serverId: SERVER_ID,
    ip: '213.87.144.30',
    ping: 0,
    isAfk: false,
    reportsCount: 12,
    minutesAgo: 1440,
    isp: 'MTS PJSC',
    city: 'Екатеринбург',
    country: 'Россия',
  },
  {
    steamId: '76561198149883602',
    name: 'ZEFIRKA',
    clientType: 'licensed',
    status: 'online',
    serverId: SERVER_ID,
    ip: '109.252.31.55',
    ping: 112,
    isAfk: true,
    reportsCount: 4,
    minutesAgo: 0,
    isp: 'PJSC MegaFon',
    city: 'Самара',
    country: 'Россия',
  },
];

async function main() {
  // Сид наполняет один демонстрационный проект: всё остальное в базе висит на нём.
  const project = await prisma.project.upsert({
    where: { slug: PROJECT_SLUG },
    create: { name: 'Demo Rust', slug: PROJECT_SLUG, onboardingStep: 4, onboardingDone: true },
    update: {},
  });
  const projectId = project.id;

  await prisma.server.upsert({
    where: { id: SERVER_ID },
    create: {
      id: SERVER_ID,
      projectId,
      name: SERVER_NAME,
      hostname: 'rust-1.local',
      maxPlayers: 300,
      uptimeSec: 84000,
      serverKey: 'dev-key-rust-1',
      serverSecret: 'dev-secret-rust-1',
    },
    update: { name: SERVER_NAME, projectId },
  });

  await prisma.server.upsert({
    where: { id: SERVER_2_ID },
    create: {
      id: SERVER_2_ID,
      projectId,
      name: SERVER_2_NAME,
      hostname: 'rust-2.local',
      maxPlayers: 200,
      uptimeSec: 41000,
      serverKey: 'dev-key-rust-2',
      serverSecret: 'dev-secret-rust-2',
    },
    update: { name: SERVER_2_NAME, projectId },
  });

  const ttl = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  for (const [index, p] of players.entries()) {
    // Размеры команд разложены по кругу 1..5, чтобы в карточке было видно все режимы:
    // соло, дуо, трио, сквад, клан.
    const teamSize = (index % 5) + 1;
    const language = p.country === 'Украина' ? 'uk' : 'ru';

    await prisma.ipInfo.upsert({
      where: { ip: p.ip },
      create: { ip: p.ip, isp: p.isp, city: p.city, country: p.country, expiresAt: ttl },
      update: { isp: p.isp, city: p.city, country: p.country, expiresAt: ttl },
    });

    const lastSeenAt = new Date(Date.now() - p.minutesAgo * 60 * 1000);

    const saved = await prisma.player.upsert({
      where: { projectId_steamId: { projectId, steamId: p.steamId } },
      create: {
        projectId,
        steamId: p.steamId,
        name: p.name,
        clientType: p.clientType,
        status: p.status,
        serverId: p.serverId,
        ip: p.ip,
        ping: p.ping,
        isAfk: p.isAfk,
        teamSize,
        language,
        ownerSteamId: p.steamId,
        reportsCount: p.reportsCount,
        lastSeenAt,
      },
      update: {
        name: p.name,
        clientType: p.clientType,
        status: p.status,
        serverId: p.serverId,
        ip: p.ip,
        ping: p.ping,
        isAfk: p.isAfk,
        teamSize,
        language,
        reportsCount: p.reportsCount,
        lastSeenAt,
      },
    });

    // Сессия нужна, чтобы отработала логика мультиаккаунта по общему IP
    // (GubaRazbita/mash_kun1 и Barik.Jr сидят с одинаковых адресов).
    const open = await prisma.playerSession.findFirst({
      where: { playerId: saved.id, endedAt: null },
    });
    if (!open && p.status !== 'offline') {
      await prisma.playerSession.create({
        data: {
          projectId,
          playerId: saved.id,
          steamId: p.steamId,
          serverId: p.serverId,
          ip: p.ip,
          startedAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      });
    }
  }

  console.log(`Сид готов: ${players.length} игроков, 2 сервера.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
