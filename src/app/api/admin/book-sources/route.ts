import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { verifyAuthRequest } from '@/lib/auth';
import { builtInBookSources, createBookAdapter } from '@/lib/books/adapters';
import { safeFetchText } from '@/lib/books/security';
import { BookSourceConfig } from '@/lib/books/types';
import { getConfig } from '@/lib/config';
import { getStorage } from '@/lib/db';

export const runtime = 'nodejs';

const sourceSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,48}$/),
  name: z.string().min(2).max(80),
  type: z.enum(['opds', 'html']),
  status: z.enum(['pending', 'enabled', 'blocked']),
  baseUrl: z.string().url(),
  searchUrlTemplate: z.string().url().optional(),
  opdsUrl: z.string().url().optional(),
  language: z.string().max(16).optional(),
  isMature: z.boolean().optional(),
  rightsBasis: z
    .enum(['public-domain', 'open-license', 'written-authorization'])
    .optional(),
  licenseUrl: z.string().url().optional(),
  rightsHolder: z.string().max(160).optional(),
  reviewedAt: z.string().datetime().or(z.string().date()).optional(),
  allowedUses: z
    .object({
      indexMetadata: z.boolean(),
      cacheMetadata: z.boolean(),
      displayFullText: z.boolean(),
      cacheFullText: z.boolean(),
    })
    .optional(),
  selectors: z
    .object({
      resultList: z.string(),
      title: z.string(),
      author: z.string().optional(),
      cover: z.string().optional(),
      detailLink: z.string(),
      description: z.string().optional(),
      tocList: z.string().optional(),
      chapterTitle: z.string().optional(),
      chapterLink: z.string().optional(),
      content: z.string().optional(),
    })
    .optional(),
});

async function requireOwner(request: NextRequest) {
  const auth = await verifyAuthRequest(request);
  return auth?.username && auth.username === process.env.USERNAME ? auth : null;
}

function validateRights(source: BookSourceConfig) {
  if (source.status !== 'enabled') return;
  if (!source.baseUrl.startsWith('https://'))
    throw new Error('HTTPS is required');
  if (source.type === 'opds' && !source.opdsUrl)
    throw new Error('OPDS URL is required');
  if (source.type === 'html') {
    if (!source.searchUrlTemplate || !source.selectors) {
      throw new Error('HTML search template and selectors are required');
    }
    if (
      !source.rightsBasis ||
      !source.licenseUrl ||
      !source.rightsHolder ||
      !source.reviewedAt ||
      !source.allowedUses?.indexMetadata
    ) {
      throw new Error(
        'Rights evidence is required before enabling an HTML source'
      );
    }
    if (source.allowedUses.displayFullText && !source.selectors.content) {
      throw new Error('A content selector is required for full-text display');
    }
  }
}

export async function GET(request: NextRequest) {
  if (!(await requireOwner(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const config = await getConfig();
  return NextResponse.json({
    builtIn: builtInBookSources(),
    custom: config.BookSourceConfig || [],
  });
}

export async function POST(request: NextRequest) {
  if (!(await requireOwner(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const parsed = sourceSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid book source configuration' },
      { status: 400 }
    );
  }
  const source = parsed.data as BookSourceConfig;
  try {
    validateRights(source);
    if (source.status === 'enabled') {
      if (source.licenseUrl) {
        await safeFetchText(source.licenseUrl, {
          timeoutMs: 5000,
          maxBytes: 512 * 1024,
          accept: 'text/html, text/plain',
        });
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        await createBookAdapter(source).search(
          '测试',
          { language: source.language === 'en' ? 'en' : 'zh', limit: 1 },
          controller.signal
        );
      } finally {
        clearTimeout(timer);
      }
    }
    const config = await getConfig();
    const list = config.BookSourceConfig || [];
    const index = list.findIndex((item) => item.key === source.key);
    if (index >= 0) list[index] = source;
    else list.push(source);
    config.BookSourceConfig = list;
    await getStorage().setAdminConfig(config);
    return NextResponse.json({ success: true, source });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Source review failed',
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await requireOwner(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const key = request.nextUrl.searchParams.get('key') || '';
  const config = await getConfig();
  config.BookSourceConfig = (config.BookSourceConfig || []).filter(
    (source) => source.key !== key
  );
  await getStorage().setAdminConfig(config);
  return NextResponse.json({ success: true });
}
