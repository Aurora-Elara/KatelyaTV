/* eslint-disable no-console */

import { NextRequest } from 'next/server';

import {
  checkBookRateLimit,
  filterMatureBooks,
  requireBookAuth,
  unauthorizedBookResponse,
} from '@/lib/books/api';
import { mergeAndRankBooks } from '@/lib/books/normalize';
import { getEnabledBookAdapters } from '@/lib/books/sources';
import { BookResult } from '@/lib/books/types';
import { runProgressiveQueue } from '@/lib/progressive-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCE_TIMEOUT_MS = 5000;
const GLOBAL_TIMEOUT_MS = 10000;

function line(value: unknown) {
  return `${JSON.stringify(value)}\n`;
}

export async function GET(request: NextRequest) {
  const auth = await requireBookAuth(request);
  if (!auth) return unauthorizedBookResponse();
  if (!(await checkBookRateLimit(auth.username, 'book-search', 30))) {
    return new Response(
      line({ type: 'error', message: '搜索过于频繁，请稍后再试' }),
      {
        status: 429,
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
      }
    );
  }
  const query = request.nextUrl.searchParams.get('q')?.trim() || '';
  const language = request.nextUrl.searchParams.get('language') || 'zh';
  if (query.length < 1 || query.length > 100) {
    return new Response(
      line({ type: 'error', message: '请输入有效书名或作者' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
      }
    );
  }
  const adapters = await getEnabledBookAdapters();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const groups: BookResult[][] = [];
      const close = () => {
        try {
          controller.close();
        } catch {
          // Client disconnected.
        }
      };
      const send = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(line(event)));
        } catch {
          // Client disconnected.
        }
      };
      try {
        send({ type: 'start', sources: adapters.length });
        const globalController = new AbortController();
        const globalTimer = setTimeout(
          () => globalController.abort(),
          GLOBAL_TIMEOUT_MS
        );
        const relayAbort = () => globalController.abort();
        request.signal.addEventListener('abort', relayAbort, { once: true });
        await runProgressiveQueue(
          adapters,
          4,
          globalController.signal,
          async (adapter) => {
            const sourceController = new AbortController();
            const sourceTimer = setTimeout(
              () => sourceController.abort(),
              SOURCE_TIMEOUT_MS
            );
            const relayGlobal = () => sourceController.abort();
            globalController.signal.addEventListener('abort', relayGlobal, {
              once: true,
            });
            try {
              const results = await adapter.search(
                query,
                {
                  language: ['zh', 'en', 'all'].includes(language)
                    ? (language as 'zh' | 'en' | 'all')
                    : 'zh',
                  limit: 20,
                },
                sourceController.signal
              );
              if (!results.length) return;
              groups.push(results);
              const merged = await filterMatureBooks(
                auth.username,
                mergeAndRankBooks(groups, query)
              );
              send({
                type: 'batch',
                source: adapter.config.key,
                sourceName: adapter.config.name,
                results: merged,
              });
            } catch (error) {
              if (!globalController.signal.aborted) {
                console.warn(
                  `Book search source failed: ${adapter.config.key}`,
                  error instanceof Error ? error.message : 'Unknown error'
                );
                send({ type: 'source-error', source: adapter.config.key });
              }
            } finally {
              clearTimeout(sourceTimer);
              globalController.signal.removeEventListener('abort', relayGlobal);
            }
          }
        );
        clearTimeout(globalTimer);
        request.signal.removeEventListener('abort', relayAbort);
        send({
          type: 'done',
          results: await filterMatureBooks(
            auth.username,
            mergeAndRankBooks(groups, query)
          ),
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          send({ type: 'error', message: '书籍搜索暂时不可用' });
        }
      } finally {
        close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
