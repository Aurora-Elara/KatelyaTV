import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireBookAuth, unauthorizedBookResponse } from '@/lib/books/api';
import { BookBookmark } from '@/lib/books/types';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const bookmarkSchema = z.object({
  id: z.string().min(3).max(100),
  key: z.string().min(3).max(500),
  source: z.string().min(1).max(80),
  bookId: z.string().min(1).max(400),
  chapterId: z.string().max(500).optional(),
  chapterIndex: z.number().int().min(0).optional(),
  progress: z.number().min(0).max(1).optional(),
  epubCfi: z.string().max(2000).optional(),
  label: z.string().min(1).max(100),
  createdAt: z.number(),
});

export async function GET(request: NextRequest) {
  const auth = await requireBookAuth(request);
  if (!auth) return unauthorizedBookResponse();
  return NextResponse.json(await db.getBookBookmarks(auth.username));
}

export async function POST(request: NextRequest) {
  const auth = await requireBookAuth(request);
  if (!auth) return unauthorizedBookResponse();
  const parsed = bookmarkSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid bookmark' }, { status: 400 });
  }
  await db.saveBookBookmark(auth.username, parsed.data as BookBookmark);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireBookAuth(request);
  if (!auth) return unauthorizedBookResponse();
  const id = request.nextUrl.searchParams.get('id') || '';
  if (!id)
    return NextResponse.json({ error: 'Missing bookmark id' }, { status: 400 });
  await db.deleteBookBookmark(auth.username, id);
  return NextResponse.json({ success: true });
}
