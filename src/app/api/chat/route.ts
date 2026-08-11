import { NextResponse } from 'next/server';
import { isAnyServerConnected, listChatMessages } from '@/lib/chat';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  const [connected, messages] = await Promise.all([isAnyServerConnected(projectId), listChatMessages(projectId)]);
  return NextResponse.json(
    { connected, messages },
    { headers: { 'cache-control': 'no-store' } },
  );
}
