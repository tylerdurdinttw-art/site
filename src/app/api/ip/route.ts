import { NextResponse } from 'next/server';
import { lookupIpDetails } from '@/lib/ipLookup';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Адрес выглядит как IPv4 или IPv6 — большего от строки из базы не требуется. */
const IP_PATTERN = /^[0-9a-fA-F:.]{3,45}$/;

/** Кто ещё играет с этого адреса, плюс город, страна и провайдер. */
export async function GET(req: Request) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const ip = new URL(req.url).searchParams.get('address')?.trim() ?? '';
  if (!ip || !IP_PATTERN.test(ip)) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 });
  }

  const lookup = await lookupIpDetails(ip);
  return NextResponse.json(lookup, { headers: { 'cache-control': 'no-store' } });
}
