import path from 'node:path';
import fs from 'node:fs';
import { prisma } from '@/lib/prisma';
import { checkVpn } from '@/lib/vpn';

/**
 * Обогащение IP: город, страна и провайдер. Результат кешируется в ip_info
 * на IP_INFO_TTL_DAYS, поэтому один и тот же адрес пробивается один раз.
 *
 * Источников два, в таком порядке:
 *  1. Локальные базы MaxMind GeoLite2 (.mmdb) — быстро и без сети;
 *  2. Бесплатный ip-api.com — если баз нет или в них этого адреса не нашлось.
 *
 * Второй источник добавлен потому, что без .mmdb пробив молча отдавал пустые
 * поля: в карточке игрока стояли прочерки, и понять, что не хватает именно
 * баз, было невозможно. Отключается переменной IP_LOOKUP_FALLBACK=off.
 */

type MaxmindReader = {
  city: (ip: string) => { city?: { names?: Record<string, string> }; country?: { names?: Record<string, string> } };
  asn: (ip: string) => { autonomousSystemOrganization?: string };
};

const TTL_DAYS = Number(process.env.IP_INFO_TTL_DAYS ?? 30);

const globalForGeo = globalThis as unknown as {
  __ynazicottvGeo?: { city: MaxmindReader | null; asn: MaxmindReader | null };
};

let readers = globalForGeo.__ynazicottvGeo ?? null;

async function getReaders() {
  if (readers) return readers;

  const cityPath = process.env.GEOLITE2_CITY_DB
    ? path.resolve(process.cwd(), process.env.GEOLITE2_CITY_DB)
    : null;
  const asnPath = process.env.GEOLITE2_ASN_DB
    ? path.resolve(process.cwd(), process.env.GEOLITE2_ASN_DB)
    : null;

  let city: MaxmindReader | null = null;
  let asn: MaxmindReader | null = null;

  try {
    const { Reader } = await import('@maxmind/geoip2-node');
    if (cityPath && fs.existsSync(cityPath)) {
      city = (await Reader.open(cityPath)) as unknown as MaxmindReader;
    }
    if (asnPath && fs.existsSync(asnPath)) {
      asn = (await Reader.open(asnPath)) as unknown as MaxmindReader;
    }
  } catch (err) {
    console.error('[geo] не удалось открыть базы GeoLite2:', err);
  }

  readers = { city, asn };
  globalForGeo.__ynazicottvGeo = readers;
  return readers;
}

export interface IpDetails {
  isp: string | null;
  city: string | null;
  country: string | null;
  /** null — провайдер неизвестен, судить не по чему. */
  isVpn: boolean | null;
}

const EMPTY: IpDetails = { isp: null, city: null, country: null, isVpn: null };

/** Сколько ждём ответа от внешнего справочника — карточка игрока не должна висеть. */
const FALLBACK_TIMEOUT_MS = 4000;

interface IpApiResponse {
  status?: string;
  message?: string;
  country?: string;
  city?: string;
  isp?: string;
  org?: string;
  as?: string;
  /** Признак хостинга/дата-центра от самого ip-api. */
  hosting?: boolean;
  proxy?: boolean;
}

/**
 * Запасной источник — ip-api.com. Ключа не требует, лимит 45 запросов в минуту
 * на адрес панели; при таком кеше этого хватает с большим запасом.
 * Любая ошибка здесь не фатальна: вернём пустоту и оставим поля неизвестными.
 */
async function lookupOnline(ip: string): Promise<IpDetails | null> {
  if ((process.env.IP_LOOKUP_FALLBACK ?? 'on') === 'off') return null;

  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}` +
        '?fields=status,message,country,city,isp,org,as,proxy,hosting&lang=ru',
      { cache: 'no-store', signal: AbortSignal.timeout(FALLBACK_TIMEOUT_MS) },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as IpApiResponse;
    if (data.status !== 'success') return null;

    const isp = data.isp || data.org || data.as || null;
    const verdict = checkVpn(isp);

    return {
      isp,
      city: data.city || null,
      country: data.country || null,
      // Свой вердикт сервиса тоже учитываем: он знает про хостинги больше списка слов.
      isVpn: verdict.isVpn === true || data.hosting === true || data.proxy === true,
    };
  } catch (err) {
    console.error('[geo] запасной пробив IP не удался:', err);
    return null;
  }
}

function isPrivate(ip: string): boolean {
  return (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('127.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === '::1'
  );
}

/**
 * Читает из кеша, при промахе — из .mmdb и, если там пусто, из внешнего
 * справочника. Результат кладётся в ip_info.
 *
 * `online: false` запрещает ходить в сеть — так делает пакетный разбор
 * heartbeat, чтобы сотня новых адресов не растянула обработку на минуты.
 */
export async function lookupIp(
  ip: string | null | undefined,
  { online = true }: { online?: boolean } = {},
): Promise<IpDetails> {
  if (!ip || isPrivate(ip)) return EMPTY;

  const cached = await prisma.ipInfo.findUnique({ where: { ip } });
  if (cached && cached.expiresAt > new Date()) {
    return {
      isp: cached.isp,
      city: cached.city,
      country: cached.country,
      // Вердикт по VPN пересчитываем на чтении: список ключевых слов мог пополниться
      // уже после того, как строка попала в кеш. Сохранённое «да» не отменяем:
      // его мог поставить внешний справочник, который знает про хостинги больше.
      isVpn: cached.isVpn || checkVpn(cached.isp).isVpn,
    };
  }

  const { city: cityReader, asn: asnReader } = await getReaders();
  const details: IpDetails = { ...EMPTY };

  try {
    if (cityReader) {
      const res = cityReader.city(ip);
      details.city = res.city?.names?.ru ?? res.city?.names?.en ?? null;
      details.country = res.country?.names?.ru ?? res.country?.names?.en ?? null;
    }
  } catch {
    /* IP не найден в базе — оставляем null */
  }

  try {
    if (asnReader) {
      details.isp = asnReader.asn(ip).autonomousSystemOrganization ?? null;
    }
  } catch {
    /* IP не найден в базе — оставляем null */
  }

  const verdict = checkVpn(details.isp);
  details.isVpn = verdict.isVpn;

  // Локальные базы ничего не дали — идём в интернет. Дописываем только пустые
  // поля: то, что нашлось в .mmdb, точнее и обновляется вместе с базами.
  if (online && (!details.isp || !details.country)) {
    const remote = await lookupOnline(ip);
    if (remote) {
      details.isp = details.isp ?? remote.isp;
      details.city = details.city ?? remote.city;
      details.country = details.country ?? remote.country;
      if (details.isVpn !== true) details.isVpn = remote.isVpn;
    }
  }

  // Пустой результат держим в кеше час, а не месяц: он значит «не смогли узнать»,
  // а не «узнали, что ничего нет», — и следующая попытка должна быть скорой.
  const known = Boolean(details.isp || details.country);
  const expiresAt = new Date(
    Date.now() + (known ? TTL_DAYS * 24 * 60 * 60 * 1000 : 60 * 60 * 1000),
  );
  const row = {
    isp: details.isp,
    city: details.city,
    country: details.country,
    isVpn: details.isVpn === true,
    vpnReason: checkVpn(details.isp).reason,
  };

  await prisma.ipInfo.upsert({
    where: { ip },
    create: { ip, ...row, expiresAt },
    update: { ...row, fetchedAt: new Date(), expiresAt },
  });

  return details;
}

/**
 * Сколько новых адресов за один heartbeat разрешено пробить через сеть.
 * Остальные подождут следующего: heartbeat приходит раз в полминуты, и класть
 * его обработку ради полного вайпа справочника незачем.
 */
const ONLINE_BUDGET_PER_BATCH = 20;

/** Пакетное обогащение — один проход по уникальным IP. */
export async function lookupMany(
  ips: (string | null | undefined)[],
): Promise<Map<string, IpDetails>> {
  const unique = Array.from(new Set(ips.filter((v): v is string => Boolean(v))));
  const out = new Map<string, IpDetails>();
  if (unique.length === 0) return out;

  // Кто уже лежит в кеше — узнаём одним запросом: у таких адресов lookupIp
  // в сеть не пойдёт, и тратить на них бюджет не за что.
  const fresh = await prisma.ipInfo.findMany({
    where: { ip: { in: unique }, expiresAt: { gt: new Date() } },
    select: { ip: true },
  });
  const cachedIps = new Set(fresh.map((row) => row.ip));

  let budget = ONLINE_BUDGET_PER_BATCH;
  for (const ip of unique) {
    const isNew = !cachedIps.has(ip);
    out.set(ip, await lookupIp(ip, { online: !isNew || budget > 0 }));
    if (isNew) budget -= 1;
  }

  return out;
}
