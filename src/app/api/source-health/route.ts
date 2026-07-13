import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { generateSignature, verifyAuthRequest } from '@/lib/auth';
import { getAvailableApiSites } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'edge';

const reportSchema = z
  .object({
    sourceKey: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
    success: z.boolean(),
    failureKind: z
      .enum([
        'http',
        'not_found',
        'manifest',
        'fragment',
        'timeout',
        'network',
        'media',
      ])
      .optional(),
    latencyMs: z.number().min(0).max(120000).optional(),
    startupTimeMs: z.number().min(0).max(120000).optional(),
    speedKBps: z.number().min(0).max(1000000).optional(),
    height: z.number().int().min(0).max(8640).optional(),
    videoCodec: z.string().max(40).optional(),
    audioCodec: z.string().max(40).optional(),
    browserCompatible: z.boolean().optional(),
  })
  .strict();

const bodySchema = z
  .object({ reports: z.array(reportSchema).min(1).max(10) })
  .strict();

export async function GET(request: NextRequest) {
  const auth = await verifyAuthRequest(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sites = await getAvailableApiSites(true);
  const scores = await db.getSourceHealthScores(sites.map((site) => site.key));
  return NextResponse.json(
    { scores },
    { headers: { 'Cache-Control': 'private, max-age=30' } }
  );
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuthRequest(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid health report' },
      { status: 400 }
    );
  }

  const identityHash = (
    await generateSignature(auth.username, process.env.AUTH_PASSWORD || '')
  ).slice(0, 24);
  const allowed = await db.checkSourceHealthRateLimit(identityHash, 6, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many reports' }, { status: 429 });
  }

  const sites = await getAvailableApiSites(true);
  const enabledKeys = new Set(sites.map((site) => site.key));
  const reports = parsed.data.reports.filter((report) =>
    enabledKeys.has(report.sourceKey)
  );
  await Promise.all(
    reports.map((report) =>
      db.recordSourceHealth({ ...report, phase: 'playback' })
    )
  );
  return NextResponse.json({ accepted: reports.length });
}
