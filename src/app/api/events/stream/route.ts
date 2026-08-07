import { NextResponse } from 'next/server';
import { bus, eventsSince } from '@/lib/eventBus';
import type { PanelEvent } from '@/lib/types';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEEPALIVE_MS = 20_000;

/**
 * SSE-поток событий панели.
 * `?poll=1` — фолбэк для клиентов без SSE: отдаёт JSON с событиями после `lastId`.
 */
export async function GET(req: Request) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const url = new URL(req.url);

  if (url.searchParams.get('poll') === '1') {
    const events = eventsSince(url.searchParams.get('lastId'));
    return NextResponse.json({ events }, { headers: { 'cache-control': 'no-store' } });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (event: PanelEvent) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`id: ${event.id}\nevent: panel\ndata: ${JSON.stringify(event)}\n\n`),
        );
      };

      const onEvent = (event: PanelEvent) => send(event);

      controller.enqueue(encoder.encode(': connected\n\n'));
      bus.on('event', onEvent);

      const keepalive = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(': keepalive\n\n'));
      }, KEEPALIVE_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepalive);
        bus.off('event', onEvent);
        try {
          controller.close();
        } catch {
          /* поток уже закрыт клиентом */
        }
      };

      req.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
