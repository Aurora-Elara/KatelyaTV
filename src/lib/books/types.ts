export type BookAccess =
  | 'fulltext'
  | 'preview'
  | 'borrow'
  | 'purchase'
  | 'metadata';

export type BookFormat = 'html' | 'txt' | 'epub' | 'pdf' | 'external';

export type BookMaturity = 'general' | 'mature' | 'unknown';

export type BookSourceType = 'mediawiki' | 'metadata' | 'opds' | 'html';

export type BookSourceStatus = 'pending' | 'enabled' | 'blocked';

export type BookRightsBasis =
  | 'public-domain'
  | 'open-license'
  | 'written-authorization';

export interface BookAllowedUses {
  indexMetadata: boolean;
  cacheMetadata: boolean;
  displayFullText: boolean;
  cacheFullText: boolean;
}

export interface BookHtmlSelectors {
  resultList: string;
  title: string;
  author?: string;
  cover?: string;
  detailLink: string;
  description?: string;
  tocList?: string;
  chapterTitle?: string;
  chapterLink?: string;
  content?: string;
}

export interface BookSourceConfig {
  key: string;
  name: string;
  type: BookSourceType;
  status: BookSourceStatus;
  baseUrl: string;
  searchUrlTemplate?: string;
  opdsUrl?: string;
  language?: string;
  isMature?: boolean;
  rightsBasis?: BookRightsBasis;
  licenseUrl?: string;
  rightsHolder?: string;
  reviewedAt?: string;
  allowedUses?: BookAllowedUses;
  selectors?: BookHtmlSelectors;
}

export interface BookExternalLink {
  label: string;
  url: string;
  kind: 'preview' | 'borrow' | 'purchase' | 'source';
}

export interface BookResult {
  id: string;
  source: string;
  sourceName: string;
  title: string;
  authors: string[];
  language: string;
  cover?: string;
  description?: string;
  publishedDate?: string;
  publisher?: string;
  isbn13?: string;
  access: BookAccess;
  formats: BookFormat[];
  maturity: BookMaturity;
  attribution?: string;
  licenseUrl?: string;
  externalLinks?: BookExternalLink[];
}

export interface BookDetail extends BookResult {
  subjects?: string[];
  pageCount?: number;
  revision?: string;
  sourceUrl?: string;
  acquisitions?: BookAcquisition[];
}

export interface BookChapter {
  id: string;
  title: string;
  index: number;
}

export interface BookChapterContent {
  bookId: string;
  chapterId: string;
  title: string;
  format: 'html' | 'txt';
  html?: string;
  text?: string;
  revision?: string;
  attribution?: string;
  licenseUrl?: string;
}

export interface BookAcquisition {
  id: string;
  format: BookFormat;
  access: BookAccess;
  externalUrl?: string;
  contentType?: string;
  size?: number;
}

export interface BookFavorite {
  key: string;
  book: BookResult;
  savedAt: number;
}

export interface BookProgress {
  key: string;
  source: string;
  bookId: string;
  chapterId?: string;
  chapterIndex?: number;
  progress: number;
  epubCfi?: string;
  updatedAt: number;
}

export interface BookBookmark {
  id: string;
  key: string;
  source: string;
  bookId: string;
  chapterId?: string;
  chapterIndex?: number;
  progress?: number;
  epubCfi?: string;
  label: string;
  createdAt: number;
}

export interface BookSearchOptions {
  language?: 'zh' | 'en' | 'all';
  limit?: number;
}

export interface BookSourceAdapter {
  readonly config: BookSourceConfig;
  search(
    query: string,
    options: BookSearchOptions,
    signal: AbortSignal
  ): Promise<BookResult[]>;
  getDetail(id: string, signal: AbortSignal): Promise<BookDetail>;
  getToc(id: string, signal: AbortSignal): Promise<BookChapter[]>;
  getChapter(
    id: string,
    chapterId: string,
    signal: AbortSignal
  ): Promise<BookChapterContent>;
  getAcquisition?(
    id: string,
    acquisitionId: string,
    signal: AbortSignal
  ): Promise<BookAcquisition>;
}
