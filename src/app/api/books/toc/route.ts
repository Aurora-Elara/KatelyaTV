import { NextRequest, NextResponse } from 'next/server';

import {
  getBookCache,
  requireBookAuth,
  setBookCache,
  unauthorizedBookResponse,
} from '@/lib/books/api';
import { getBookAdapter } from '@/lib/books/sources';
import { BookChapter } from '@/lib/books/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!(await requireBookAuth(request))) return unauthorizedBookResponse();
  const source = request.nextUrl.searchParams.get('source') || '';
  const id = request.nextUrl.searchParams.get('id') || '';
  if (!source || !id) {
    return NextResponse.json(
      { error: 'Missing source or id' },
      { status: 400 }
    );
  }
  const key = `toc:${source}:${id}`;
  const cached = getBookCache<BookChapter[]>(key);
  if (cached) return NextResponse.json(cached);
  try {
    const chapters = await (
      await getBookAdapter(source)
    ).getToc(id, request.signal);
    if (chapters.length) setBookCache(key, chapters, 6 * 60 * 60);
    return NextResponse.json(chapters);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Book TOC failed' },
      { status: 502 }
    );
  }
}
