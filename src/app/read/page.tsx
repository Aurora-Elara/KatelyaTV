'use client';

import {
  ArrowLeft,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  Settings,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  BookBookmark,
  BookChapter,
  BookChapterContent,
  BookProgress,
} from '@/lib/books/types';

import EpubReader from '@/components/books/EpubReader';

type ReaderTheme = 'light' | 'sepia' | 'dark';

function ReaderClient() {
  const params = useSearchParams();
  const source = params.get('source') || '';
  const id = params.get('id') || '';
  const title = params.get('title') || '阅读';
  const format = params.get('format') as 'epub' | 'txt' | null;
  const acquisition = params.get('acquisition') || '0';
  const initialChapter = params.get('chapter') || '';
  const bookKey = `${source}+${id}`;
  const [chapters, setChapters] = useState<BookChapter[]>([]);
  const [chapterId, setChapterId] = useState(initialChapter);
  const [content, setContent] = useState<BookChapterContent | null>(null);
  const [txtContent, setTxtContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.9);
  const [pageWidth, setPageWidth] = useState(760);
  const [theme, setTheme] = useState<ReaderTheme>('light');
  const [progress, setProgress] = useState(0);
  const [epubCfi, setEpubCfi] = useState<string>();
  const progressRef = useRef(0);
  const epubCfiRef = useRef<string>();
  const scrollRef = useRef<HTMLDivElement>(null);

  const chapterIndex = useMemo(
    () =>
      Math.max(
        0,
        chapters.findIndex((chapter) => chapter.id === chapterId)
      ),
    [chapterId, chapters]
  );

  useEffect(() => {
    const savedSettings = localStorage.getItem(
      'katelyatv_book_reader_settings'
    );
    if (savedSettings) {
      try {
        const saved = JSON.parse(savedSettings);
        setFontSize(saved.fontSize || 18);
        setLineHeight(saved.lineHeight || 1.9);
        setPageWidth(saved.pageWidth || 760);
        setTheme(saved.theme || 'light');
      } catch {
        // Ignore invalid local settings.
      }
    }
    fetch(`/api/books/library/progress?key=${encodeURIComponent(bookKey)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((saved: BookProgress | null) => {
        if (!saved) return;
        setProgress(saved.progress || 0);
        progressRef.current = saved.progress || 0;
        setEpubCfi(saved.epubCfi);
        epubCfiRef.current = saved.epubCfi;
        if (!initialChapter && saved.chapterId) setChapterId(saved.chapterId);
      });
  }, [bookKey, initialChapter]);

  useEffect(() => {
    localStorage.setItem(
      'katelyatv_book_reader_settings',
      JSON.stringify({ fontSize, lineHeight, pageWidth, theme })
    );
  }, [fontSize, lineHeight, pageWidth, theme]);

  useEffect(() => {
    if (format) return;
    fetch(
      `/api/books/toc?source=${encodeURIComponent(
        source
      )}&id=${encodeURIComponent(id)}`
    )
      .then(async (response) => {
        if (!response.ok) throw new Error('目录加载失败');
        return response.json();
      })
      .then((toc: BookChapter[]) => {
        setChapters(toc);
        if (!chapterId && toc[0]) setChapterId(toc[0].id);
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : '目录加载失败')
      );
  }, [chapterId, format, id, source]);

  useEffect(() => {
    if (format === 'epub') {
      setLoading(false);
      return;
    }
    if (format === 'txt') {
      fetch(
        `/api/books/acquire?source=${encodeURIComponent(
          source
        )}&id=${encodeURIComponent(id)}&acquisition=${encodeURIComponent(
          acquisition
        )}`,
        { cache: 'no-store' }
      )
        .then(async (response) => {
          if (!response.ok) throw new Error('TXT 获取失败');
          return response.text();
        })
        .then(setTxtContent)
        .catch((reason) =>
          setError(reason instanceof Error ? reason.message : 'TXT 打开失败')
        )
        .finally(() => setLoading(false));
      return;
    }
    if (!chapterId) return;
    setLoading(true);
    setError('');
    fetch(
      `/api/books/chapter?source=${encodeURIComponent(
        source
      )}&id=${encodeURIComponent(id)}&chapter=${encodeURIComponent(chapterId)}`,
      { cache: 'no-store' }
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error((await response.json()).error || '章节加载失败');
        return response.json();
      })
      .then((chapter) => {
        setContent(chapter);
        requestAnimationFrame(() => {
          const node = scrollRef.current;
          if (node) node.scrollTop = node.scrollHeight * progressRef.current;
        });
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : '章节加载失败')
      )
      .finally(() => setLoading(false));
  }, [acquisition, chapterId, format, id, source]);

  const saveProgress = useCallback(async () => {
    const payload: BookProgress = {
      key: bookKey,
      source,
      bookId: id,
      chapterId: format ? undefined : chapterId,
      chapterIndex: format ? undefined : chapterIndex,
      progress: progressRef.current,
      epubCfi: epubCfiRef.current,
      updatedAt: Date.now(),
    };
    await fetch('/api/books/library/progress', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
  }, [bookKey, chapterId, chapterIndex, format, id, source]);

  useEffect(() => {
    const timer = window.setInterval(saveProgress, 15000);
    const handleExit = () => void saveProgress();
    window.addEventListener('pagehide', handleExit);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', handleExit);
      void saveProgress();
    };
  }, [saveProgress]);

  const onScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const max = node.scrollHeight - node.clientHeight;
    const value = max > 0 ? node.scrollTop / max : 1;
    progressRef.current = value;
    setProgress(value);
  };

  const addBookmark = async () => {
    const bookmark: BookBookmark = {
      id: crypto.randomUUID(),
      key: bookKey,
      source,
      bookId: id,
      chapterId: format ? undefined : chapterId,
      chapterIndex: format ? undefined : chapterIndex,
      progress,
      epubCfi,
      label: format
        ? `${title} ${(progress * 100).toFixed(0)}%`
        : content?.title || title,
      createdAt: Date.now(),
    };
    await fetch('/api/books/library/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookmark),
    });
  };

  const changeChapter = (offset: number) => {
    const next = chapters[chapterIndex + offset];
    if (!next) return;
    void saveProgress();
    setProgress(0);
    progressRef.current = 0;
    setChapterId(next.id);
    setShowToc(false);
  };

  const background =
    theme === 'dark'
      ? 'bg-gray-950 text-gray-200'
      : theme === 'sepia'
      ? 'bg-[#f5efe2] text-[#3f3528]'
      : 'bg-white text-gray-800';
  const acquireUrl = `/api/books/acquire?source=${encodeURIComponent(
    source
  )}&id=${encodeURIComponent(id)}&acquisition=${encodeURIComponent(
    acquisition
  )}`;
  const handleEpubProgress = useCallback((value: number, cfi?: string) => {
    progressRef.current = value;
    epubCfiRef.current = cfi;
    setProgress(value);
    setEpubCfi(cfi);
  }, []);

  return (
    <div className={`fixed inset-0 z-[800] flex flex-col ${background}`}>
      <header className='flex h-14 shrink-0 items-center justify-between border-b border-current/10 px-3 sm:px-5'>
        <div className='flex min-w-0 items-center gap-2'>
          <Link
            href={`/books/detail?source=${encodeURIComponent(
              source
            )}&id=${encodeURIComponent(id)}`}
            title='返回图书详情'
            className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10'
          >
            <ArrowLeft className='h-5 w-5' />
          </Link>
          <h1 className='truncate text-sm font-semibold sm:text-base'>
            {content?.title || title}
          </h1>
        </div>
        <div className='flex shrink-0 items-center gap-1'>
          {!format && (
            <button
              onClick={() => setShowToc(true)}
              title='目录'
              className='flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10'
            >
              <List className='h-5 w-5' />
            </button>
          )}
          <button
            onClick={addBookmark}
            title='添加书签'
            className='flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10'
          >
            <BookmarkPlus className='h-5 w-5' />
          </button>
          <button
            onClick={() => setShowSettings((value) => !value)}
            title='阅读设置'
            className='flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10'
          >
            <Settings className='h-5 w-5' />
          </button>
        </div>
      </header>

      {showSettings && (
        <div className='absolute right-3 top-16 z-30 w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border border-gray-200 bg-white p-4 text-gray-800 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'>
          <div className='space-y-4 text-sm'>
            <label className='block'>
              字号 {fontSize}px
              <input
                type='range'
                min='14'
                max='28'
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
                className='mt-2 w-full accent-emerald-600'
              />
            </label>
            <label className='block'>
              行高 {lineHeight.toFixed(1)}
              <input
                type='range'
                min='1.4'
                max='2.4'
                step='0.1'
                value={lineHeight}
                onChange={(event) => setLineHeight(Number(event.target.value))}
                className='mt-2 w-full accent-emerald-600'
              />
            </label>
            <label className='block'>
              页面宽度 {pageWidth}px
              <input
                type='range'
                min='520'
                max='980'
                step='20'
                value={pageWidth}
                onChange={(event) => setPageWidth(Number(event.target.value))}
                className='mt-2 w-full accent-emerald-600'
              />
            </label>
            <div className='grid grid-cols-3 gap-2'>
              {(['light', 'sepia', 'dark'] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`rounded-md border px-2 py-2 text-xs ${
                    theme === value
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-gray-300 dark:border-gray-700'
                  }`}
                >
                  {value === 'light'
                    ? '明亮'
                    : value === 'sepia'
                    ? '纸张'
                    : '深色'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showToc && (
        <aside className='absolute inset-y-0 left-0 z-40 w-[min(22rem,88vw)] border-r border-gray-200 bg-white text-gray-900 shadow-2xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'>
          <div className='flex h-14 items-center justify-between border-b border-gray-200 px-4 dark:border-gray-700'>
            <strong>目录</strong>
            <button onClick={() => setShowToc(false)} title='关闭目录'>
              <X className='h-5 w-5' />
            </button>
          </div>
          <div className='h-[calc(100%-3.5rem)] overflow-y-auto p-2'>
            {chapters.map((chapter) => (
              <button
                key={chapter.id}
                onClick={() => {
                  void saveProgress();
                  setProgress(0);
                  progressRef.current = 0;
                  setChapterId(chapter.id);
                  setShowToc(false);
                }}
                className={`block w-full rounded-md px-3 py-3 text-left text-sm ${
                  chapter.id === chapterId
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {chapter.title}
              </button>
            ))}
          </div>
        </aside>
      )}

      <main
        ref={scrollRef}
        onScroll={onScroll}
        className='min-h-0 flex-1 overflow-y-auto'
      >
        {loading ? (
          <div className='flex h-full items-center justify-center text-gray-500'>
            <Loader2 className='mr-2 h-5 w-5 animate-spin' />
            正在载入正文…
          </div>
        ) : error ? (
          <div className='flex h-full items-center justify-center px-6 text-center text-red-600'>
            {error}
          </div>
        ) : format === 'epub' ? (
          <EpubReader
            url={acquireUrl}
            initialCfi={epubCfi}
            fontSize={fontSize}
            theme={theme}
            onProgress={handleEpubProgress}
          />
        ) : (
          <article
            className='book-reader-content mx-auto min-h-full px-5 py-10 sm:px-10'
            style={{
              maxWidth: `${pageWidth}px`,
              fontSize: `${fontSize}px`,
              lineHeight,
            }}
          >
            {format === 'txt' ? (
              <pre className='whitespace-pre-wrap font-serif'>{txtContent}</pre>
            ) : (
              <div dangerouslySetInnerHTML={{ __html: content?.html || '' }} />
            )}
            {content?.attribution && (
              <p className='mt-12 border-t border-current/10 pt-4 text-xs opacity-60'>
                来源署名：{content.attribution}
              </p>
            )}
          </article>
        )}
      </main>

      {!format && chapters.length > 1 && (
        <footer className='flex h-14 shrink-0 items-center justify-between border-t border-current/10 px-4'>
          <button
            disabled={chapterIndex <= 0}
            onClick={() => changeChapter(-1)}
            className='flex items-center gap-1 text-sm disabled:opacity-30'
          >
            <ChevronLeft className='h-4 w-4' />
            上一章
          </button>
          <span className='text-xs opacity-60'>
            {chapterIndex + 1} / {chapters.length}
          </span>
          <button
            disabled={chapterIndex >= chapters.length - 1}
            onClick={() => changeChapter(1)}
            className='flex items-center gap-1 text-sm disabled:opacity-30'
          >
            下一章
            <ChevronRight className='h-4 w-4' />
          </button>
        </footer>
      )}
    </div>
  );
}

export default function ReadPage() {
  return (
    <Suspense>
      <ReaderClient />
    </Suspense>
  );
}
