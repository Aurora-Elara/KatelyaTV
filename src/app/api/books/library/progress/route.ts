import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireBookAuth, unauthorizedBookResponse } from '@/lib/books/api';
import { BookProgress } from '@/lib/books/types';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const progressSchema = z.object({
  key: z.string().min(3).max(500),
  source: z.string().min(1).max(80),
  bookId: z.string().min(1).max(400),
  chapterId: z.string().max(500).optional(),
  chapterIndex: z.number().int().min(0).optional(),
  progress: z.number().min(0).max(1),
  epubCfi: z.string().max(2000).optional(),
  updatedAt: z.number(),
});

export async function GET(request: NextRequest) {
  const auth = await requireBookAuth(request);
  if (!auth) return unauthorizedBookResponse();
  const key = request.nextUrl.searchParams.get('key');
  return NextResponse.json(
    key
      ? await db.getBookProgress(auth.username, key)
      : await db.getAllBookProgress(auth.username)
  );
}

export async function PUT(request: NextRequest) {
  const auth = await requireBookAuth(request);
  if (!auth) return unauthorizedBookResponse();
  const parsed = progressSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid reading progress' },
      { status: 400 }
    );
  }
  await db.saveBookProgress(
    auth.username,
    parsed.data.key,
    parsed.data as BookProgress
  );
  return NextResponse.json({ success: true });
}
