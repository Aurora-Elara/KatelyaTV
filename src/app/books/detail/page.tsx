'use client';

import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  Check,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import { BookChapter, BookDetail, BookFavorite } from '@/lib/books/types';

import PageLayout from '@/components/PageLayout';

function BookDetailClient() {
  const params = useSearchParams();
  const source = params.get('source') || '';
  const id = params.get('id') || '';
  const key = `${source}+${id}`;
  const [book, setBook] = useState<BookDetail | null>(null);
  const [chapters, setChapters] = useState<BookChapter[]>([]);
  const [favorite, setFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!source || !id) return;
    const detailUrl = `/api/books/detail?source=${encodeURIComponent(
      source
    )}&id=${encodeURIComponent(id)}`;
    const tocUrl = `/api/books/toc?source=${encodeURIComponent(
      source
    )}&id=${encodeURIComponent(id)}`;
    Promise.all([
      fetch(detailUrl).then(async (response) => {
        if (!response.ok)
          throw new Error((await response.json()).error || '图书详情加载失败');
        return response.json();
      }),
      fetch(tocUrl).then((response) => (response.ok ? response.json() : [])),
      fetch('/api/books/library/favorites').then((response) =>
        response.ok ? response.json() : {}
      ),
    ])
      .then(([detail, toc, saved]) => {
        setBook(detail);
        setChapters(toc);
        setFavorite(Boolean((saved as Record<string, BookFavorite>)[key]));
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : '加载失败')
      )
      .finally(() => setLoading(false));
  }, [id, key, source]);

  const readerHref = useMemo(() => {
    if (!book) return null;
    const acquisition = book.acquisitions?.find((item) =>
      ['epub', 'txt'].includes(item.format)
    );
    if (acquisition) {
      return `/read?source=${encodeURIComponent(
        source
      )}&id=${encodeURIComponent(id)}&format=${
        acquisition.format
      }&acquisition=${encodeURIComponent(
        acquisition.id
      )}&title=${encodeURIComponent(book.title)}`;
    }
    if (chapters.length) {
      return `/read?source=${encodeURIComponent(
        source
      )}&id=${encodeURIComponent(id)}&chapter=${encodeURIComponent(
        chapters[0].id
      )}&title=${encodeURIComponent(book.title)}`;
    }
    return null;
  }, [book, chapters, id, source]);

  const toggleFavorite = async () => {
    if (!book) return;
    if (favorite) {
      await fetch(
        `/api/books/library/favorites?key=${encodeURIComponent(key)}`,
        {
          method: 'DELETE',
        }
      );
      setFavorite(false);
      return;
    }
    const payload: BookFavorite = { key, book, savedAt: Date.now() };
    const response = await fetch('/api/books/library/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, favorite: payload }),
    });
    if (response.ok) setFavorite(true);
  };

  if (loading) {
    return (
      <PageLayout activePath='/books'>
        <div className='flex min-h-[60vh] items-center justify-center text-gray-500'>
          <Loader2 className='mr-2 h-5 w-5 animate-spin' />
          加载图书详情…
        </div>
      </PageLayout>
    );
  }

  if (!book || error) {
    return (
      <PageLayout activePath='/books'>
        <div className='mx-auto max-w-2xl py-16 text-center'>
          <p className='text-red-600'>{error || '没有找到这本书'}</p>
          <Link
            href='/books'
            className='mt-5 inline-flex items-center gap-2 text-emerald-700'
          >
            <ArrowLeft className='h-4 w-4' />
            返回书城
          </Link>
        </div>
      </PageLayout>
    );
  }

  const cover = book.cover
    ? `/api/image-proxy?url=${encodeURIComponent(book.cover)}`
    : null;

  return (
    <PageLayout activePath='/books'>
      <div className='mx-auto max-w-5xl space-y-8'>
        <Link
          href='/books'
          className='inline-flex items-center gap-2 text-sm text-gray-500 hover:text-emerald-700'
        >
          <ArrowLeft className='h-4 w-4' />
          返回书城
        </Link>
        <section className='grid gap-7 border-b border-gray-200 pb-8 dark:border-gray-700 sm:grid-cols-[180px_minmax(0,1fr)]'>
          <div className='relative mx-auto aspect-[2/3] w-44 overflow-hidden rounded-lg bg-gray-100 shadow-sm dark:bg-gray-800 sm:mx-0'>
            {cover ? (
              <Image
                src={cover}
                alt={book.title}
                fill
                unoptimized
                sizes='180px'
                className='object-cover'
              />
            ) : (
              <BookOpen className='absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-gray-400' />
            )}
          </div>
          <div className='min-w-0'>
            <p className='text-sm font-medium text-emerald-700 dark:text-emerald-400'>
              {book.sourceName}
            </p>
            <h1 className='mt-1 text-3xl font-bold text-gray-900 dark:text-white'>
              {book.title}
            </h1>
            <p className='mt-2 text-gray-600 dark:text-gray-300'>
              {book.authors.join('、') || '作者未标注'}
            </p>
            <div className='mt-4 flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300'>
              <span className='rounded bg-gray-100 px-2 py-1 dark:bg-gray-800'>
                {book.language.toUpperCase()}
              </span>
              <span className='rounded bg-gray-100 px-2 py-1 dark:bg-gray-800'>
                {book.access}
              </span>
              {book.publishedDate && (
                <span className='rounded bg-gray-100 px-2 py-1 dark:bg-gray-800'>
                  {book.publishedDate}
                </span>
              )}
              {book.isbn13 && (
                <span className='rounded bg-gray-100 px-2 py-1 dark:bg-gray-800'>
                  ISBN {book.isbn13}
                </span>
              )}
            </div>
            <div className='mt-6 flex flex-wrap gap-3'>
              {readerHref && (
                <Link
                  href={readerHref}
                  className='inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700'
                >
                  <BookOpen className='h-4 w-4' />
                  开始阅读
                </Link>
              )}
              <button
                onClick={toggleFavorite}
                className='inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:border-emerald-500 hover:text-emerald-700 dark:border-gray-700 dark:text-gray-200'
              >
                {favorite ? (
                  <Check className='h-4 w-4' />
                ) : (
                  <Bookmark className='h-4 w-4' />
                )}
                {favorite ? '已加入书架' : '加入书架'}
              </button>
            </div>
          </div>
        </section>

        {book.description && (
          <section>
            <h2 className='text-lg font-semibold text-gray-900 dark:text-white'>
              内容简介
            </h2>
            <p className='mt-3 whitespace-pre-line text-sm leading-7 text-gray-600 dark:text-gray-300'>
              {book.description}
            </p>
          </section>
        )}

        {chapters.length > 0 && (
          <section>
            <h2 className='text-lg font-semibold text-gray-900 dark:text-white'>
              目录
            </h2>
            <div className='mt-3 grid gap-2 sm:grid-cols-2'>
              {chapters.slice(0, 80).map((chapter) => (
                <Link
                  key={chapter.id}
                  href={`/read?source=${encodeURIComponent(
                    source
                  )}&id=${encodeURIComponent(id)}&chapter=${encodeURIComponent(
                    chapter.id
                  )}&title=${encodeURIComponent(book.title)}`}
                  className='truncate border-b border-gray-200 px-2 py-3 text-sm text-gray-700 hover:text-emerald-700 dark:border-gray-800 dark:text-gray-300'
                >
                  {chapter.title}
                </Link>
              ))}
            </div>
          </section>
        )}

        {book.externalLinks?.length ? (
          <section>
            <h2 className='text-lg font-semibold text-gray-900 dark:text-white'>
              正版与来源链接
            </h2>
            <div className='mt-3 flex flex-wrap gap-2'>
              {book.externalLinks.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target='_blank'
                  rel='noreferrer'
                  className='inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:border-emerald-500 dark:border-gray-700 dark:text-gray-300'
                >
                  {link.label}
                  <ExternalLink className='h-3.5 w-3.5' />
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {book.attribution && (
          <footer className='border-t border-gray-200 pt-4 text-xs leading-5 text-gray-500 dark:border-gray-700'>
            来源署名：{book.attribution}
            {book.licenseUrl && (
              <a
                href={book.licenseUrl}
                target='_blank'
                rel='noreferrer'
                className='ml-2 text-emerald-700'
              >
                查看许可
              </a>
            )}
          </footer>
        )}
      </div>
    </PageLayout>
  );
}

export default function BookDetailPage() {
  return (
    <Suspense>
      <BookDetailClient />
    </Suspense>
  );
}
