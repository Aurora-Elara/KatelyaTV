import { NextRequest, NextResponse } from 'next/server';

import { withOfficialSearchLinks } from '@/lib/books/adapters';
import {
  getBookCache,
  requireBookAuth,
  setBookCache,
  unauthorizedBookResponse,
} from '@/lib/books/api';
import { getBookAdapter } from '@/lib/books/sources';
import { BookDetail } from '@/lib/books/types';

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
  const key = `detail:${source}:${id}`;
  const cached = getBookCache<BookDetail>(key);
  if (cached) return NextResponse.json(cached);
  try {
    const adapter = await getBookAdapter(source);
    const detail = withOfficialSearchLinks(
      await adapter.getDetail(id, request.signal)
    );
    setBookCache(key, detail, 6 * 60 * 60);
    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Book detail failed' },
      { status: 502 }
    );
  }
}
