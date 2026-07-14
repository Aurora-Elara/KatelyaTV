'use client';

import { BookOpen, Library, Loader2, Search, ShieldCheck } from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';

import { BookFavorite, BookResult } from '@/lib/books/types';

import BookCard from '@/components/books/BookCard';
import PageLayout from '@/components/PageLayout';

type Tab = 'discover' | 'public' | 'library';

function BooksPageClient() {
  const [tab, setTab] = useState<Tab>('discover');
  const [language, setLanguage] = useState<'zh' | 'en' | 'all'>('zh');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BookResult[]>([]);
  const [discover, setDiscover] = useState<BookResult[]>([]);
  const [favorites, setFavorites] = useState<Record<string, BookFavorite>>({});
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/books/discover?language=${language}`).then((response) =>
        response.ok ? response.json() : []
      ),
      fetch('/api/books/library/favorites').then((response) =>
        response.ok ? response.json() : {}
      ),
    ])
      .then(([books, saved]) => {
        if (!cancelled) {
          setDiscover(books);
          setFavorites(saved);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [language]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const searchBooks = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    setMessage('');
    setResults([]);
    try {
      const response = await fetch(
        `/api/books/search/progressive?q=${encodeURIComponent(
          value
        )}&language=${language}`,
        { signal: controller.signal }
      );
      if (!response.ok || !response.body) throw new Error('搜索暂时不可用');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamDone = false;
      while (!streamDone) {
        const { value: chunk, done } = await reader.read();
        if (done) {
          streamDone = true;
          continue;
        }
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        lines.forEach((line) => {
          if (!line.trim()) return;
          const eventData = JSON.parse(line) as {
            type: string;
            results?: BookResult[];
            message?: string;
          };
          if (eventData.results) setResults(eventData.results);
          if (eventData.type === 'error')
            setMessage(eventData.message || '搜索失败');
        });
      }
      setTab('discover');
    } catch (error) {
      if (!controller.signal.aborted) {
        setMessage(error instanceof Error ? error.message : '搜索失败');
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSearching(false);
    }
  };

  const visibleBooks = useMemo(() => {
    if (tab === 'library')
      return Object.values(favorites).map((item) => item.book);
    const source = results.length ? results : discover;
    return tab === 'public'
      ? source.filter((book) => book.access === 'fulltext')
      : source;
  }, [discover, favorites, results, tab]);

  return (
    <PageLayout activePath='/books'>
      <div className='mx-auto w-full max-w-6xl space-y-6'>
        <header className='flex flex-col gap-4 border-b border-gray-200 pb-5 dark:border-gray-700 sm:flex-row sm:items-end sm:justify-between'>
          <div>
            <h1 className='flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white'>
              <BookOpen className='h-6 w-6 text-emerald-600' />
              书城
            </h1>
            <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
              公版全文、开放目录与正版书目信息
            </p>
          </div>
          <div className='inline-flex self-start rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900'>
            {(['zh', 'en', 'all'] as const).map((value) => (
              <button
                key={value}
                onClick={() => setLanguage(value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  language === value
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {value === 'zh' ? '中文' : value === 'en' ? '英文' : '全部'}
              </button>
            ))}
          </div>
        </header>

        <form onSubmit={searchBooks} className='flex gap-2'>
          <div className='relative min-w-0 flex-1'>
            <Search className='absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400' />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='搜索书名、作者或 ISBN'
              className='h-11 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-3 text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white'
            />
          </div>
          <button
            type='submit'
            disabled={searching}
            className='flex h-11 shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60'
          >
            {searching ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <Search className='h-4 w-4' />
            )}
            搜索
          </button>
        </form>

        <div className='flex items-center gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700'>
          {(
            [
              ['discover', '发现', BookOpen],
              ['public', '公版全文', ShieldCheck],
              ['library', '我的书架', Library],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${
                tab === value
                  ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <Icon className='h-4 w-4' />
              {label}
            </button>
          ))}
        </div>

        {(loading || searching) && !visibleBooks.length ? (
          <div className='flex min-h-64 items-center justify-center text-gray-500'>
            <Loader2 className='mr-2 h-5 w-5 animate-spin' />
            {searching ? '正在从多个书源检索…' : '正在载入书城…'}
          </div>
        ) : visibleBooks.length ? (
          <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5'>
            {visibleBooks.map((book) => (
              <BookCard key={`${book.source}:${book.id}`} book={book} />
            ))}
          </div>
        ) : (
          <div className='min-h-48 border-y border-gray-200 py-14 text-center dark:border-gray-700'>
            <Library className='mx-auto h-9 w-9 text-gray-400' />
            <p className='mt-3 text-sm text-gray-500'>
              {message ||
                (tab === 'library' ? '书架还是空的' : '暂时没有找到图书')}
            </p>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

export default function BooksPage() {
  return (
    <Suspense>
      <BooksPageClient />
    </Suspense>
  );
}
