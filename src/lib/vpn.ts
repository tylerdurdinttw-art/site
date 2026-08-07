/**
 * Признак VPN/прокси по названию организации ASN.
 *
 * Внешние сервисы проверки не дёргаются: провайдер уже известен из локальной GeoLite2-ASN,
 * а домашние операторы и дата-центры различаются по названию организации. Метод грубый,
 * поэтому результат подаётся в интерфейсе как «похоже на VPN», а не как факт.
 *
 * Список расширяется через VPN_ASN_KEYWORDS — подстроки через запятую, регистр не важен.
 */

/** Хостинги, облака и известные VPN-сервисы. Сравнение по подстроке в нижнем регистре. */
const HOSTING_KEYWORDS = [
  'vpn',
  'proxy',
  'hosting',
  'datacenter',
  'data center',
  'dedicated',
  'colocation',
  'cloud',
  'vps',
  'vds',
  'amazon',
  'aws',
  'azure',
  'microsoft corporation',
  'google llc',
  'google cloud',
  'oracle',
  'alibaba',
  'tencent',
  'digitalocean',
  'linode',
  'vultr',
  'choopa',
  'ovh',
  'hetzner',
  'contabo',
  'leaseweb',
  'scaleway',
  'online s.a.s',
  'm247',
  'g-core',
  'gcore',
  'ihor',
  'aeza',
  'vdsina',
  'zomro',
  'timeweb',
  'beget',
  'firstvds',
  'reg.ru',
  'selectel',
  'serverius',
  'servers.com',
  'stark industries',
  'nordvpn',
  'surfshark',
  'mullvad',
  'private internet access',
  'expressvpn',
  'cyberghost',
  'protonvpn',
  'windscribe',
  'datacamp',
  'packethub',
  'flyservers',
  'quickpacket',
  'hostkey',
  'mivocloud',
  'ipxo',
];

/** Домашние операторы, чьё название иначе поймалось бы по «cloud»/«server»/«dedicated». */
const RESIDENTIAL_EXCEPTIONS = ['cloudflare warp'];

function extraKeywords(): string[] {
  return (process.env.VPN_ASN_KEYWORDS ?? '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export interface VpnVerdict {
  /** null — судить не по чему: провайдер неизвестен. */
  isVpn: boolean | null;
  /** Совпавшая подстрока — чтобы вердикт можно было объяснить. */
  reason: string | null;
}

export function checkVpn(isp: string | null | undefined): VpnVerdict {
  if (!isp) return { isVpn: null, reason: null };

  const value = isp.toLowerCase();
  if (RESIDENTIAL_EXCEPTIONS.some((word) => value.includes(word))) {
    return { isVpn: false, reason: null };
  }

  const hit = [...HOSTING_KEYWORDS, ...extraKeywords()].find((word) => value.includes(word));
  return { isVpn: Boolean(hit), reason: hit ?? null };
}
