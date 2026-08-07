import path from 'node:path';
import fs from 'node:fs';
import { prisma } from '@/lib/prisma';
import { checkVpn } from '@/lib/vpn';

/**
 * Обогащение IP через локальные базы MaxMind GeoLite2 (.mmdb).
 * Внешние API не используются. Результат кешируется в таблице ip_info на IP_INFO_TTL_DAYS.
 *
 * GeoLite2-City -> город/страна, GeoLite2-ASN -> организация (используем как ISP).
 * Если базы не положены — работает вхолостую, поля остаются null.
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

function isPrivate(ip: string): boolean {
  return (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('127.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === '::1'
  );
}

/** Читает из кеша, при промахе — из .mmdb, и записывает в ip_info. */
export async function lookupIp(ip: string | null | undefined): Promise<IpDetails> {
  if (!ip || isPrivate(ip)) return EMPTY;

  const cached = await prisma.ipInfo.findUnique({ where: { ip } });
  if (cached && cached.expiresAt > new Date()) {
    return {
      isp: cached.isp,
      city: cached.city,
      country: cached.country,
      // Вердикт по VPN пересчитываем на чтении: список ключевых слов мог пополниться
      // уже после того, как строка попала в кеш.
      isVpn: checkVpn(cached.isp).isVpn,
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

  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
  const row = {
    isp: details.isp,
    city: details.city,
    country: details.country,
    isVpn: verdict.isVpn === true,
    vpnReason: verdict.reason,
  };

  await prisma.ipInfo.upsert({
    where: { ip },
    create: { ip, ...row, expiresAt },
    update: { ...row, fetchedAt: new Date(), expiresAt },
  });

  return details;
}

/** Пакетное обогащение — один проход по уникальным IP. */
export async function lookupMany(ips: (string | null | undefined)[]): Promise<Map<string, IpDetails>> {
  const unique = Array.from(new Set(ips.filter((v): v is string => Boolean(v))));
  const out = new Map<string, IpDetails>();
  for (const ip of unique) {
    out.set(ip, await lookupIp(ip));
  }
  return out;
}
