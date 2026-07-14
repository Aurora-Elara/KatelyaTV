import { BookResult } from './types';

export function normalizeBookText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function dedupeKey(book: BookResult): string {
  if (book.isbn13) return `isbn:${book.isbn13.replace(/\D/g, '')}`;
  return [
    normalizeBookText(book.title),
    normalizeBookText(book.authors.join(',')),
    book.language.toLowerCase(),
  ].join('|');
}

function accessScore(access: BookResult['access']): number {
  return { fulltext: 5, preview: 4, borrow: 3, purchase: 2, metadata: 1 }[
    access
  ];
}

function rankBook(book: BookResult, query: string): number {
  const exact = normalizeBookText(book.title) === normalizeBookText(query);
  const chinese = /^zh/i.test(book.language);
  return (
    accessScore(book.access) * 100 +
    (exact ? 80 : 0) +
    (chinese ? 30 : 0) +
    (book.cover ? 10 : 0) +
    (book.source === 'wikisource-zh' ? 5 : 0)
  );
}

export function mergeAndRankBooks(
  groups: BookResult[][],
  query: string
): BookResult[] {
  const map = new Map<string, BookResult>();
  groups.flat().forEach((book) => {
    const key = dedupeKey(book);
    const current = map.get(key);
    if (!current || rankBook(book, query) > rankBook(current, query)) {
      map.set(key, {
        ...book,
        externalLinks: Array.from(
          new Map(
            [
              ...(current?.externalLinks || []),
              ...(book.externalLinks || []),
            ].map((link) => [link.url, link])
          ).values()
        ),
      });
    }
  });
  return Array.from(map.values()).sort(
    (a, b) => rankBook(b, query) - rankBook(a, query)
  );
}

export function officialBookSearchLinks(query: string) {
  const encoded = encodeURIComponent(query.trim());
  return [
    {
      label: '起点中文网',
      url: `https://www.qidian.com/soushu/${encoded}.html`,
      kind: 'purchase' as const,
    },
    {
      label: '番茄小说',
      url: `https://fanqienovel.com/search/${encoded}`,
      kind: 'purchase' as const,
    },
    {
      label: '微信读书',
      url: `https://weread.qq.com/web/search/books?keyword=${encoded}`,
      kind: 'purchase' as const,
    },
  ];
}
