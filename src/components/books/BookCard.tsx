'use client';

import { BookOpen, ExternalLink, Library, ShoppingBag } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { BookResult } from '@/lib/books/types';

function accessLabel(access: BookResult['access']) {
  return {
    fulltext: '可阅读全文',
    preview: '合法预览',
    borrow: '可借阅',
    purchase: '正版购买',
    metadata: '书目信息',
  }[access];
}

function AccessIcon({ access }: { access: BookResult['access'] }) {
  if (access === 'fulltext') return <BookOpen className='h-3.5 w-3.5' />;
  if (access === 'borrow') return <Library className='h-3.5 w-3.5' />;
  if (access === 'purchase') return <ShoppingBag className='h-3.5 w-3.5' />;
  return <ExternalLink className='h-3.5 w-3.5' />;
}

export default function BookCard({ book }: { book: BookResult }) {
  const href = `/books/detail?source=${encodeURIComponent(
    book.source
  )}&id=${encodeURIComponent(book.id)}`;
  const cover = book.cover
    ? `/api/image-proxy?url=${encodeURIComponent(book.cover)}`
    : null;
  return (
    <article className='min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900'>
      <Link href={href} className='block'>
        <div className='relative aspect-[2/3] w-full bg-gray-100 dark:bg-gray-800'>
          {cover ? (
            <Image
              src={cover}
              alt={book.title}
              fill
              unoptimized
              sizes='(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 180px'
              className='object-cover'
            />
          ) : (
            <div className='flex h-full items-center justify-center px-4 text-center text-sm text-gray-400'>
              <BookOpen className='h-10 w-10' aria-hidden='true' />
              <span className='sr-only'>{book.title}</span>
            </div>
          )}
          <span className='absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/75 px-2 py-1 text-xs text-white'>
            <AccessIcon access={book.access} />
            {accessLabel(book.access)}
          </span>
        </div>
        <div className='space-y-1 p-3'>
          <h3 className='line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-5 text-gray-900 dark:text-gray-100'>
            {book.title}
          </h3>
          <p className='truncate text-xs text-gray-500 dark:text-gray-400'>
            {book.authors.join('、') || '作者未标注'}
          </p>
          <div className='flex items-center justify-between gap-2 text-xs text-gray-400'>
            <span className='truncate'>{book.sourceName}</span>
            <span>{book.language.toUpperCase()}</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
