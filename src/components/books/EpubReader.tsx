'use client';

import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface EpubLocation {
  start?: { cfi?: string; percentage?: number };
}

interface EpubRendition {
  display(target?: string): Promise<void>;
  prev(): Promise<void>;
  next(): Promise<void>;
  destroy(): void;
  on(event: string, callback: (location: EpubLocation) => void): void;
  themes: {
    register(name: string, rules: Record<string, Record<string, string>>): void;
    select(name: string): void;
    fontSize(size: string): void;
  };
}

interface EpubBook {
  renderTo(
    element: HTMLElement,
    options: Record<string, string | number | boolean>
  ): EpubRendition;
  destroy(): void;
}

interface EpubFactory {
  (input: ArrayBuffer): EpubBook;
}

interface Props {
  url: string;
  initialCfi?: string;
  fontSize: number;
  theme: 'light' | 'sepia' | 'dark';
  onProgress: (progress: number, cfi?: string) => void;
}

export default function EpubReader({
  url,
  initialCfi,
  fontSize,
  theme,
  onProgress,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<EpubRendition | null>(null);
  const themeRef = useRef(theme);
  const fontSizeRef = useRef(fontSize);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let book: EpubBook | null = null;
    const load = async () => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error('EPUB 获取失败');
        const buffer = await response.arrayBuffer();
        const epubModule = await import('epubjs');
        const factory = epubModule.default as unknown as EpubFactory;
        if (!active || !containerRef.current) return;
        book = factory(buffer);
        const rendition = book.renderTo(containerRef.current, {
          width: '100%',
          height: '100%',
          flow: 'paginated',
          spread: 'none',
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;
        rendition.themes.register('light', {
          body: {
            color: '#1f2937',
            background: '#ffffff',
            'line-height': '1.8',
          },
        });
        rendition.themes.register('sepia', {
          body: {
            color: '#3f3528',
            background: '#f5efe2',
            'line-height': '1.8',
          },
        });
        rendition.themes.register('dark', {
          body: {
            color: '#e5e7eb',
            background: '#111827',
            'line-height': '1.8',
          },
        });
        rendition.themes.select(themeRef.current);
        rendition.themes.fontSize(`${fontSizeRef.current}px`);
        rendition.on('relocated', (location) => {
          onProgress(
            Math.max(0, Math.min(1, location.start?.percentage || 0)),
            location.start?.cfi
          );
        });
        await rendition.display(initialCfi);
      } catch (reason) {
        if (active)
          setError(reason instanceof Error ? reason.message : 'EPUB 打开失败');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
      renditionRef.current?.destroy();
      renditionRef.current = null;
      book?.destroy();
    };
  }, [initialCfi, onProgress, url]);

  useEffect(() => {
    themeRef.current = theme;
    fontSizeRef.current = fontSize;
    renditionRef.current?.themes.select(theme);
    renditionRef.current?.themes.fontSize(`${fontSize}px`);
  }, [fontSize, theme]);

  return (
    <div className='relative h-full min-h-[70vh] w-full'>
      <div ref={containerRef} className='h-full min-h-[70vh] w-full' />
      {loading && (
        <div className='absolute inset-0 flex items-center justify-center bg-inherit text-gray-500'>
          <Loader2 className='mr-2 h-5 w-5 animate-spin' />
          正在打开 EPUB…
        </div>
      )}
      {error && (
        <div className='absolute inset-0 flex items-center justify-center px-6 text-center text-red-600'>
          {error}
        </div>
      )}
      {!loading && !error && (
        <div className='pointer-events-none absolute inset-x-0 bottom-4 flex justify-between px-4'>
          <button
            aria-label='上一页'
            title='上一页'
            onClick={() => renditionRef.current?.prev()}
            className='pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/65 text-white shadow'
          >
            <ChevronLeft className='h-5 w-5' />
          </button>
          <button
            aria-label='下一页'
            title='下一页'
            onClick={() => renditionRef.current?.next()}
            className='pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/65 text-white shadow'
          >
            <ChevronRight className='h-5 w-5' />
          </button>
        </div>
      )}
    </div>
  );
}
