import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

import { verifyAuthRequest } from '@/lib/auth';
import { db, getStorage } from '@/lib/db';

import { BookResult } from './types';

export async function requireBookAuth(request: NextRequest) {
  const auth = await verifyAuthRequest(request);
  if (!auth) return null;
  return auth;
}

export function unauthorizedBookResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function checkBookRateLimit(
  username: string,
  scope: string,
  limit: number
): Promise<boolean> {
  const secret = process.env.AUTH_PASSWORD || 'katelyatv';
  const identity = createHash('sha256')
    .update(`${secret}:${scope}:${username}`)
    .digest('hex');
  return db.checkSourceHealthRateLimit(identity, limit, 60);
}

export async function filterMatureBooks(
  username: string,
  books: BookResult[]
): Promise<BookResult[]> {
  const settings = await getStorage().getUserSettings(username);
  return settings?.filter_adult_content === false
    ? books
    : books.filter((book) => book.maturity !== 'mature');
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cacheKey = Symbol.for('__KATELYATV_BOOK_CACHE__');
const globalCache = globalThis as typeof globalThis & {
  [cacheKey]?: Map<string, CacheEntry<unknown>>;
};
const cache = (globalCache[cacheKey] ||= new Map());

export function getBookCache<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setBookCache<T>(key: string, value: T, ttlSeconds: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}
