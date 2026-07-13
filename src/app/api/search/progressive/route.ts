/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { verifyAuthRequest } from '@/lib/auth';
import { getAvailableApiSites } from '@/lib/config';
import { db } from '@/lib/db';
import { searchFromApi } from '@/lib/downstream';
import { runProgressiveQueue } from '@/lib/progressive-search';
import { getSourceTier, ProgressiveSearchEvent } from '@/lib/search-results';
import { SourceHealthScore } from '@/lib/types';

export const runtime = 'edge';

const CONCURRENCY = 6;
const SOURCE_TIMEOUT_MS = 5000;
const GLOBAL_TIMEOUT_MS = 10000;

export async function GET(request: NextRequest) {
  const auth = await verifyAuthRequest(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get('q')?.trim() || '';
  if (!query || query.length > 100) {
    return NextResponse.json({ error: '搜索词无效' }, { status: 400 });
  }

  const sites = await getAvailableApiSites(true);
  const healthScores: Record<string, SourceHealthScore> = await db
    .getSourceHealthScores(sites.map((site) => site.key))
    .catch(() => ({} as Record<string, SourceHealthScore>));
  const byHealth = (a: (typeof sites)[number], b: (typeof sites)[number]) =>
    (healthScores[b.key]?.overallScore || 50) -
    (healthScores[a.key]?.overallScore || 50);
  const orderedSites = [
    ...sites.filter((site) => getSourceTier(site) === 'primary').sort(byHealth),
    ...sites
      .filter((site) => getSourceTier(site) === 'discovery')
      .sort(byHealth),
  ];
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const startedAt = Date.now();
      const globalController = new AbortController();
      const cancelFromRequest = () => globalController.abort();
      request.signal.addEventListener('abort', cancelFromRequest, {
        once: true,
      });
      let completed = 0;
      let emittedCompleted = 0;
      let closed = false;

      const send = (event: ProgressiveSearchEvent) => {
        if (!closed)
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      const deadline = setTimeout(
        () => globalController.abort(),
        GLOBAL_TIMEOUT_MS
      );

      const run = async () => {
        completed = await runProgressiveQueue(
          orderedSites,
          CONCURRENCY,
          globalController.signal,
          async (site) => {
            const circuitOpen = await db.isSourceCircuitOpen(site.key);
            const rawResults = circuitOpen
              ? []
              : await searchFromApi(site, query, {
                  timeoutMs: SOURCE_TIMEOUT_MS,
                  maxPages: 3,
                  signal: globalController.signal,
                  onHealth: (event) =>
                    db.recordSourceHealth({
                      sourceKey: site.key,
                      phase: 'search',
                      success: event.ok,
                      failureKind: event.failureKind,
                      latencyMs: event.latencyMs,
                    }),
                });
            const results = rawResults.map((result) => ({
              ...result,
              source_health_score: healthScores[site.key]?.overallScore || 50,
            }));
            send({
              type: 'source',
              source: site.key,
              tier: getSourceTier(site),
              results,
              elapsedMs: Date.now() - startedAt,
            });
            emittedCompleted += 1;
            send({
              type: 'progress',
              completed: emittedCompleted,
              total: orderedSites.length,
            });
          }
        );
      };

      void run().finally(() => {
        clearTimeout(deadline);
        request.signal.removeEventListener('abort', cancelFromRequest);
        if (closed) return;
        send({
          type: 'done',
          completed,
          total: orderedSites.length,
          timedOut: completed < orderedSites.length,
        });
        closed = true;
        controller.close();
      });
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
