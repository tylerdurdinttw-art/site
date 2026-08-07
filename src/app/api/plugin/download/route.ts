import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLUGIN_PATH = path.join(process.cwd(), 'plugin', 'YnaziCotTvBridge.cs');

/** Отдаёт исходник плагина из plugin/ — единственный источник, копии в public нет. */
export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;

  try {
    const source = await fs.readFile(PLUGIN_PATH, 'utf8');

    return new NextResponse(source, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': 'attachment; filename="YnaziCotTvBridge.cs"',
        'cache-control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'plugin source not found' }, { status: 404 });
  }
}
