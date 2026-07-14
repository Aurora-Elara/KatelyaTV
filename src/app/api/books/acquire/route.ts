import { NextRequest, NextResponse } from 'next/server';

import {
  checkBookRateLimit,
  requireBookAuth,
  unauthorizedBookResponse,
} from '@/lib/books/api';
import { safeFetchBytes } from '@/lib/books/security';
import { getBookAdapter } from '@/lib/books/sources';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireBookAuth(request);
  if (!auth) return unauthorizedBookResponse();
  if (!(await checkBookRateLimit(auth.username, 'book-acquire', 10))) {
    return NextResponse.json(
      { error: 'Too many ebook requests' },
      { status: 429 }
    );
  }
  const source = request.nextUrl.searchParams.get('source') || '';
  const id = request.nextUrl.searchParams.get('id') || '';
  const acquisition = request.nextUrl.searchParams.get('acquisition') || '0';
  if (!source || !id) {
    return NextResponse.json(
      { error: 'Missing source or id' },
      { status: 400 }
    );
  }
  try {
    const adapter = await getBookAdapter(source);
    if (!adapter.getAcquisition) {
      return NextResponse.json(
        { error: 'This source has no ebook acquisition' },
        { status: 404 }
      );
    }
    const item = await adapter.getAcquisition(id, acquisition, request.signal);
    if (!item.externalUrl) {
      return NextResponse.json(
        { error: 'Acquisition URL is unavailable' },
        { status: 404 }
      );
    }
    if (item.format === 'pdf' || item.format === 'external') {
      return NextResponse.json({
        format: item.format,
        externalUrl: item.externalUrl,
      });
    }
    const maxBytes =
      item.format === 'epub' ? 25 * 1024 * 1024 : 2 * 1024 * 1024;
    const { bytes, response } = await safeFetchBytes(item.externalUrl, {
      signal: request.signal,
      timeoutMs: 15000,
      maxBytes,
      accept:
        item.format === 'epub'
          ? 'application/epub+zip'
          : 'text/plain, text/html',
    });
    const contentType =
      response.headers.get('content-type') || item.contentType || '';
    if (item.format === 'epub' && !/epub|zip|octet-stream/i.test(contentType)) {
      return NextResponse.json(
        { error: 'Upstream response is not an EPUB' },
        { status: 415 }
      );
    }
    let output = bytes;
    let outputType = contentType;
    if (item.format === 'txt') {
      const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim();
      let decoder: TextDecoder;
      try {
        decoder = new TextDecoder(charset || 'utf-8');
      } catch {
        decoder = new TextDecoder('gb18030');
      }
      output = new TextEncoder().encode(decoder.decode(bytes));
      outputType = 'text/plain; charset=utf-8';
    }
    return new Response(output, {
      headers: {
        'Content-Type':
          outputType ||
          (item.format === 'epub'
            ? 'application/epub+zip'
            : 'text/plain; charset=utf-8'),
        'Content-Length': String(output.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Ebook request failed',
      },
      { status: 502 }
    );
  }
}
