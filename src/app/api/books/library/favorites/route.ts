import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireBookAuth, unauthorizedBookResponse } from '@/lib/books/api';
import { BookFavorite } from '@/lib/books/types';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const favoriteSchema = z.object({
  key: z.string().min(3).max(500),
  favorite: z.object({
    key: z.string().min(3).max(500),
    savedAt: z.number(),
    book: z
      .object({
        id: z.string(),
        source: z.string(),
        sourceName: z.string(),
        title: z.string(),
        authors: z.array(z.string()),
        language: z.string(),
        access: z.enum([
          'fulltext',
          'preview',
          'borrow',
          'purchase',
          'metadata',
        ]),
        formats: z.array(z.enum(['html', 'txt', 'epub', 'pdf', 'external'])),
        maturity: z.enum(['general', 'mature', 'unknown']),
      })
      .passthrough(),
  }),
});

export async function GET(request: NextRequest) {
  const auth = await requireBookAuth(request);
  if (!auth) return unauthorizedBookResponse();
  return NextResponse.json(await db.getBookFavorites(auth.username));
}

export async function POST(request: NextRequest) {
  const auth = await requireBookAuth(request);
  if (!auth) return unauthorizedBookResponse();
  const parsed = favoriteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid favorite' }, { status: 400 });
  }
  await db.saveBookFavorite(
    auth.username,
    parsed.data.key,
    parsed.data.favorite as BookFavorite
  );
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireBookAuth(request);
  if (!auth) return unauthorizedBookResponse();
  const key = request.nextUrl.searchParams.get('key') || '';
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });
  await db.deleteBookFavorite(auth.username, key);
  return NextResponse.json({ success: true });
}
