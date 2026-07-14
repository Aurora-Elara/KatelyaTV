import { NextRequest, NextResponse } from 'next/server';

import {
  filterMatureBooks,
  getBookCache,
  requireBookAuth,
  setBookCache,
  unauthorizedBookResponse,
} from '@/lib/books/api';
import { mergeAndRankBooks } from '@/lib/books/normalize';
import { getEnabledBookAdapters } from '@/lib/books/sources';
import { BookResult } from '@/lib/books/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireBookAuth(request);
  if (!auth) return unauthorizedBookResponse();
  const language = request.nextUrl.searchParams.get('language') || 'zh';
  const cached = getBookCache<BookResult[]>(`discover:${language}`);
  if (cached) {
    return NextResponse.json(await filterMatureBooks(auth.username, cached));
  }
  const adapters = await getEnabledBookAdapters();
  const queries =
    language === 'en' ? ['classic literature'] : ['红楼梦', '科幻', '中国文学'];
  const groups = await Promise.all(
    adapters.flatMap((adapter) =>
      queries.map(async (query) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
          return await adapter.search(
            query,
            { language: language === 'en' ? 'en' : 'zh', limit: 6 },
            controller.signal
          );
        } catch {
          return [];
        } finally {
          clearTimeout(timer);
        }
      })
    )
  );
  const books = mergeAndRankBooks(groups, '');
  if (books.length) setBookCache(`discover:${language}`, books, 1800);
  return NextResponse.json(await filterMatureBooks(auth.username, books));
}
