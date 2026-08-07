import { NextResponse } from 'next/server';
import { isAnyServerConnected, listChatMessages } from '@/lib/chat';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;

  const [connected, messages] = await Promise.all([isAnyServerConnected(), listChatMessages()]);
  return NextResponse.json(
    { connected, messages },
    { headers: { 'cache-control': 'no-store' } },
  );
}
