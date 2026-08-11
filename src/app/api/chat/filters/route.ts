import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getHighlightColor, listKeywords, setHighlightColor } from '@/lib/chat';
import { isValidHexColor } from '@/lib/chatShared';
import { isDenied, requireApiProject } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_WORD_LENGTH = 40;

async function payload(projectId: string) {
  const [color, keywords] = await Promise.all([
    getHighlightColor(projectId),
    listKeywords(projectId),
  ]);
  return { color, keywords };
}

export async function GET() {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  return NextResponse.json(await payload(projectId), { headers: { 'cache-control': 'no-store' } });
}

/** Добавить ключевое слово. */
export async function POST(req: Request) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  let body: { word?: unknown };
  try {
    body = (await req.json()) as { word?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const word = typeof body.word === 'string' ? body.word.trim().toLowerCase() : '';
  if (!word) return NextResponse.json({ error: 'word is required' }, { status: 400 });
  if (word.length > MAX_WORD_LENGTH) {
    return NextResponse.json({ error: 'word is too long' }, { status: 400 });
  }

  // Повторное добавление того же слова — не ошибка, просто ничего не меняем.
  await prisma.chatKeyword.upsert({
    where: { projectId_word: { projectId, word } },
    create: { projectId, word },
    update: {},
  });

  return NextResponse.json(await payload(projectId));
}

/** Сменить цвет пометки. */
export async function PATCH(req: Request) {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  let body: { color?: unknown };
  try {
    body = (await req.json()) as { color?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!isValidHexColor(body.color)) {
    return NextResponse.json({ error: 'color must be a hex value' }, { status: 400 });
  }

  await setHighlightColor(projectId, body.color.toLowerCase());
  return NextResponse.json(await payload(projectId));
}

/** Очистить список ключевых слов целиком. */
export async function DELETE() {
  const ctx = await requireApiProject();
  if (isDenied(ctx)) return ctx;
  const { projectId } = ctx;

  await prisma.chatKeyword.deleteMany({ where: { projectId } });
  return NextResponse.json(await payload(projectId));
}
