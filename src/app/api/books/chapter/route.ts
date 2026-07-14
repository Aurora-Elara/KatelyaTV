import { NextRequest, NextResponse } from 'next/server';

import {
  checkBookRateLimit,
  getBookCache,
  requireBookAuth,
  setBookCache,
  unauthorizedBookResponse,
} from '@/lib/books/api';
import { getBookAdapter } from '@/lib/books/sources';
import { BookChapterContent } from '@/lib/books/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireBookAuth(request);
  if (!auth) return unauthorizedBookResponse();
  if (!(await checkBookRateLimit(auth.username, 'book-chapter', 60))) {
    return NextResponse.json(
      { error: 'Too many chapter requests' },
      { status: 429 }
    );
  }
  const source = request.nextUrl.searchParams.get('source') || '';
  const id = request.nextUrl.searchParams.get('id') || '';
  const chapter = request.nextUrl.searchParams.get('chapter') || '';
  if (!source || !id || !chapter) {
    return NextResponse.json(
      { error: 'Missing chapter parameters' },
      { status: 400 }
    );
  }
  const key = `chapter:${source}:${id}:${chapter}`;
  const cached = getBookCache<BookChapterContent>(key);
  if (cached) return NextResponse.json(cached);
  try {
    const content = await (
      await getBookAdapter(source)
    ).getChapter(id, chapter, request.signal);
    setBookCache(key, content, 24 * 60 * 60);
    return NextResponse.json(content);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Chapter request failed',
      },
      { status: 502 }
    );
  }
}
