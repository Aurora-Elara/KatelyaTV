/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import * as cheerio from 'cheerio';
import sanitizeHtml from 'sanitize-html';

import { officialBookSearchLinks } from './normalize';
import { OpdsEntry, parseOpdsJson, parseOpdsXml } from './opds';
import { requireHtmlRights } from './rights';
import { safeFetchText } from './security';
import {
  BookAccess,
  BookAcquisition,
  BookChapter,
  BookChapterContent,
  BookDetail,
  BookExternalLink,
  BookFormat,
  BookResult,
  BookSearchOptions,
  BookSourceAdapter,
  BookSourceConfig,
} from './types';

const WIKISOURCE_API = 'https://zh.wikisource.org/w/api.php';
const WIKISOURCE_LICENSE = 'https://creativecommons.org/licenses/by-sa/4.0/';

function cleanHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'div',
      'span',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'pre',
      'code',
      'em',
      'strong',
      'b',
      'i',
      'u',
      's',
      'ruby',
      'rt',
      'rp',
      'ul',
      'ol',
      'li',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'hr',
      'a',
      'img',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'title'],
      '*': ['lang'],
    },
    allowedSchemes: ['https'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
        target: '_blank',
      }),
    },
  });
}

function asArray<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function stripTags(value: string): string {
  return cheerio.load(value).text().replace(/\s+/g, ' ').trim();
}

function normalizeIsbn(values: unknown): string | undefined {
  const list = asArray(values as string | string[] | undefined);
  return list
    .map((value) => String(value).replace(/\D/g, ''))
    .find((value) => value.length === 13);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function assertSourceUrl(config: BookSourceConfig, value: string): URL {
  const url = new URL(value, config.baseUrl);
  if (url.protocol !== 'https:')
    throw new Error('Only HTTPS links are allowed');
  if (config.type === 'html') {
    const base = new URL(config.baseUrl);
    if (url.hostname !== base.hostname) {
      throw new Error('HTML source links must stay on the reviewed host');
    }
  }
  return url;
}

export class WikisourceZhAdapter implements BookSourceAdapter {
  readonly config: BookSourceConfig = {
    key: 'wikisource-zh',
    name: '中文维基文库',
    type: 'mediawiki',
    status: 'enabled',
    baseUrl: 'https://zh.wikisource.org/',
    language: 'zh',
    rightsBasis: 'open-license',
    licenseUrl: WIKISOURCE_LICENSE,
    rightsHolder: 'Wikimedia contributors',
    reviewedAt: '2026-07-14',
    allowedUses: {
      indexMetadata: true,
      cacheMetadata: true,
      displayFullText: true,
      cacheFullText: true,
    },
  };

  async search(
    query: string,
    options: BookSearchOptions,
    signal: AbortSignal
  ): Promise<BookResult[]> {
    if (options.language === 'en') return [];
    const url = new URL(WIKISOURCE_API);
    url.search = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srnamespace: '0',
      srlimit: String(Math.min(options.limit || 15, 30)),
      format: 'json',
      formatversion: '2',
      origin: '*',
    }).toString();
    const { text } = await safeFetchText(url, {
      signal,
      accept: 'application/json',
    });
    const data = JSON.parse(text) as {
      query?: {
        search?: Array<{ pageid: number; title: string; snippet?: string }>;
      };
    };
    return (data.query?.search || []).map((item) => ({
      id: String(item.pageid),
      source: this.config.key,
      sourceName: this.config.name,
      title: item.title,
      authors: [],
      language: 'zh',
      description: item.snippet ? stripTags(item.snippet) : undefined,
      access: 'fulltext',
      formats: ['html'],
      maturity: 'unknown',
      attribution: '中文维基文库贡献者',
      licenseUrl: WIKISOURCE_LICENSE,
      externalLinks: [
        {
          label: '查看来源',
          url: `https://zh.wikisource.org/?curid=${item.pageid}`,
          kind: 'source',
        },
      ],
    }));
  }

  async getDetail(id: string, signal: AbortSignal): Promise<BookDetail> {
    if (!/^\d+$/.test(id)) throw new Error('Invalid Wikisource page id');
    const url = new URL(WIKISOURCE_API);
    url.search = new URLSearchParams({
      action: 'query',
      pageids: id,
      prop: 'extracts|info|pageimages|revisions|categories',
      exintro: '1',
      explaintext: '1',
      piprop: 'thumbnail',
      pithumbsize: '480',
      rvprop: 'ids|timestamp',
      cllimit: '20',
      inprop: 'url',
      format: 'json',
      formatversion: '2',
      origin: '*',
    }).toString();
    const { text } = await safeFetchText(url, {
      signal,
      accept: 'application/json',
    });
    const data = JSON.parse(text) as any;
    const page = data.query?.pages?.[0];
    if (!page || page.missing) throw new Error('Wikisource work not found');
    return {
      id,
      source: this.config.key,
      sourceName: this.config.name,
      title: page.title,
      authors: [],
      language: 'zh',
      cover: page.thumbnail?.source,
      description: page.extract,
      access: 'fulltext',
      formats: ['html'],
      maturity: 'unknown',
      attribution: '中文维基文库贡献者',
      licenseUrl: WIKISOURCE_LICENSE,
      revision: String(page.revisions?.[0]?.revid || ''),
      sourceUrl: page.fullurl || `https://zh.wikisource.org/?curid=${id}`,
      subjects: (page.categories || []).map((item: { title: string }) =>
        item.title.replace(/^Category:/, '')
      ),
      externalLinks: [
        {
          label: '查看来源',
          url: page.fullurl || `https://zh.wikisource.org/?curid=${id}`,
          kind: 'source',
        },
      ],
    };
  }

  async getToc(id: string, signal: AbortSignal): Promise<BookChapter[]> {
    if (!/^\d+$/.test(id)) throw new Error('Invalid Wikisource page id');
    const url = new URL(WIKISOURCE_API);
    url.search = new URLSearchParams({
      action: 'parse',
      pageid: id,
      prop: 'sections',
      format: 'json',
      formatversion: '2',
      origin: '*',
    }).toString();
    const { text } = await safeFetchText(url, {
      signal,
      accept: 'application/json',
    });
    const data = JSON.parse(text) as any;
    const sections = (data.parse?.sections || []).filter(
      (section: { toclevel?: number }) => Number(section.toclevel || 1) <= 2
    );
    if (!sections.length) return [{ id: '0', title: '全文', index: 0 }];
    return sections.map((section: any, index: number) => ({
      id: String(section.index),
      title: stripTags(section.line || `章节 ${index + 1}`),
      index,
    }));
  }

  async getChapter(
    id: string,
    chapterId: string,
    signal: AbortSignal
  ): Promise<BookChapterContent> {
    if (!/^\d+$/.test(id) || !/^\d+$/.test(chapterId)) {
      throw new Error('Invalid Wikisource chapter');
    }
    const url = new URL(WIKISOURCE_API);
    url.search = new URLSearchParams({
      action: 'parse',
      pageid: id,
      section: chapterId,
      prop: 'text|sections|revid|displaytitle',
      disableeditsection: '1',
      format: 'json',
      formatversion: '2',
      origin: '*',
    }).toString();
    const { text } = await safeFetchText(url, {
      signal,
      accept: 'application/json',
      maxBytes: 1024 * 1024,
    });
    const data = JSON.parse(text) as any;
    if (!data.parse?.text) throw new Error('Wikisource chapter not found');
    const section = (data.parse.sections || []).find(
      (item: any) => String(item.index) === chapterId
    );
    return {
      bookId: id,
      chapterId,
      title: stripTags(section?.line || data.parse.displaytitle || '全文'),
      format: 'html',
      html: cleanHtml(data.parse.text),
      revision: String(data.parse.revid || ''),
      attribution: '中文维基文库贡献者',
      licenseUrl: WIKISOURCE_LICENSE,
    };
  }
}

export class GoogleBooksAdapter implements BookSourceAdapter {
  readonly config: BookSourceConfig = {
    key: 'google-books',
    name: 'Google Books',
    type: 'metadata',
    status: 'enabled',
    baseUrl: 'https://www.googleapis.com/',
    language: 'all',
  };

  private async getVolume(id: string, signal: AbortSignal): Promise<any> {
    if (!/^[\w-]+$/.test(id)) throw new Error('Invalid Google Books id');
    const url = new URL(`https://www.googleapis.com/books/v1/volumes/${id}`);
    const key = process.env.GOOGLE_BOOKS_API_KEY;
    if (key) url.searchParams.set('key', key);
    const { text } = await safeFetchText(url, {
      signal,
      accept: 'application/json',
    });
    return JSON.parse(text);
  }

  private mapVolume(item: any): BookResult {
    const info = item.volumeInfo || {};
    const accessInfo = item.accessInfo || {};
    const identifiers = info.industryIdentifiers || [];
    const isbn13 = identifiers.find(
      (entry: any) => entry.type === 'ISBN_13'
    )?.identifier;
    const viewability = String(accessInfo.viewability || 'NO_PAGES');
    const access: BookAccess =
      viewability === 'ALL_PAGES'
        ? 'fulltext'
        : ['PARTIAL', 'SAMPLE'].includes(viewability)
        ? 'preview'
        : info.saleInfo?.saleability === 'FOR_SALE'
        ? 'purchase'
        : 'metadata';
    const formats: BookFormat[] = [];
    if (accessInfo.epub?.isAvailable) formats.push('epub');
    if (accessInfo.pdf?.isAvailable) formats.push('pdf');
    formats.push('external');
    const links: BookExternalLink[] = [];
    if (info.previewLink) {
      links.push({
        label: 'Google Books 预览',
        url: info.previewLink,
        kind: 'preview',
      });
    }
    if (info.infoLink) {
      links.push({ label: '图书详情', url: info.infoLink, kind: 'source' });
    }
    return {
      id: item.id,
      source: this.config.key,
      sourceName: this.config.name,
      title: info.title || '未命名图书',
      authors: info.authors || [],
      language: info.language || 'unknown',
      cover: info.imageLinks?.thumbnail?.replace(/^http:/, 'https:'),
      description: info.description,
      publishedDate: info.publishedDate,
      publisher: info.publisher,
      isbn13,
      access,
      formats: Array.from(new Set(formats)),
      maturity: info.maturityRating === 'MATURE' ? 'mature' : 'general',
      externalLinks: links,
    };
  }

  async search(
    query: string,
    options: BookSearchOptions,
    signal: AbortSignal
  ): Promise<BookResult[]> {
    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.searchParams.set('q', query);
    url.searchParams.set(
      'maxResults',
      String(Math.min(options.limit || 20, 40))
    );
    url.searchParams.set('printType', 'books');
    if (options.language !== 'all' && options.language) {
      url.searchParams.set('langRestrict', options.language);
    }
    const key = process.env.GOOGLE_BOOKS_API_KEY;
    if (key) url.searchParams.set('key', key);
    const { text } = await safeFetchText(url, {
      signal,
      accept: 'application/json',
    });
    const data = JSON.parse(text) as any;
    return (data.items || []).map((item: any) => this.mapVolume(item));
  }

  async getDetail(id: string, signal: AbortSignal): Promise<BookDetail> {
    const item = await this.getVolume(id, signal);
    return {
      ...this.mapVolume(item),
      subjects: item.volumeInfo?.categories || [],
      pageCount: item.volumeInfo?.pageCount,
      sourceUrl: item.volumeInfo?.infoLink,
    };
  }

  async getToc(): Promise<BookChapter[]> {
    return [];
  }

  async getChapter(): Promise<BookChapterContent> {
    throw new Error(
      'Google Books content is available through its legal preview only'
    );
  }
}

let openLibraryNextRequest = 0;

async function waitForOpenLibrary(signal: AbortSignal) {
  const wait = Math.max(0, openLibraryNextRequest - Date.now());
  if (!wait) {
    openLibraryNextRequest = Date.now() + 1000;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, wait);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
  openLibraryNextRequest = Date.now() + 1000;
}

export class OpenLibraryAdapter implements BookSourceAdapter {
  readonly config: BookSourceConfig = {
    key: 'open-library',
    name: 'Open Library',
    type: 'metadata',
    status: 'enabled',
    baseUrl: 'https://openlibrary.org/',
    language: 'all',
  };

  private userAgent() {
    return `KatelyaTV/1.0 (https://katelyatv.com; ${
      process.env.BOOK_SOURCE_CONTACT || 'contact unavailable'
    })`;
  }

  async search(
    query: string,
    options: BookSearchOptions,
    signal: AbortSignal
  ): Promise<BookResult[]> {
    await waitForOpenLibrary(signal);
    const url = new URL('https://openlibrary.org/search.json');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(Math.min(options.limit || 20, 30)));
    url.searchParams.set(
      'fields',
      'key,title,author_name,isbn,language,first_publish_year,cover_i,ebook_access,publisher'
    );
    if (options.language && options.language !== 'all') {
      url.searchParams.set('language', options.language);
    }
    const { text } = await safeFetchText(url, {
      signal,
      accept: 'application/json',
      userAgent: this.userAgent(),
    });
    const data = JSON.parse(text) as any;
    return (data.docs || []).map((item: any) => {
      const ebookAccess = String(item.ebook_access || 'no_ebook');
      const access: BookAccess =
        ebookAccess === 'public'
          ? 'fulltext'
          : ebookAccess === 'borrowable'
          ? 'borrow'
          : 'metadata';
      const workId = String(item.key || '').replace('/works/', '');
      return {
        id: workId,
        source: this.config.key,
        sourceName: this.config.name,
        title: item.title || 'Untitled',
        authors: item.author_name || [],
        language: item.language?.[0] || 'unknown',
        cover: item.cover_i
          ? `https://covers.openlibrary.org/b/id/${item.cover_i}-L.jpg`
          : undefined,
        publishedDate: item.first_publish_year
          ? String(item.first_publish_year)
          : undefined,
        publisher: item.publisher?.[0],
        isbn13: normalizeIsbn(item.isbn),
        access,
        formats: ['external'],
        maturity: 'unknown',
        externalLinks: [
          {
            label: access === 'borrow' ? '前往借阅' : 'Open Library',
            url: `https://openlibrary.org/works/${workId}`,
            kind: access === 'borrow' ? 'borrow' : 'source',
          },
        ],
      } satisfies BookResult;
    });
  }

  async getDetail(id: string, signal: AbortSignal): Promise<BookDetail> {
    if (!/^OL\d+W$/i.test(id)) throw new Error('Invalid Open Library work id');
    await waitForOpenLibrary(signal);
    const { text } = await safeFetchText(
      `https://openlibrary.org/works/${id}.json`,
      { signal, accept: 'application/json', userAgent: this.userAgent() }
    );
    const item = JSON.parse(text) as any;
    const description =
      typeof item.description === 'string'
        ? item.description
        : item.description?.value;
    return {
      id,
      source: this.config.key,
      sourceName: this.config.name,
      title: item.title || 'Untitled',
      authors: [],
      language: 'unknown',
      cover: item.covers?.[0]
        ? `https://covers.openlibrary.org/b/id/${item.covers[0]}-L.jpg`
        : undefined,
      description,
      access: 'metadata',
      formats: ['external'],
      maturity: 'unknown',
      subjects: item.subjects || [],
      sourceUrl: `https://openlibrary.org/works/${id}`,
      externalLinks: [
        {
          label: 'Open Library',
          url: `https://openlibrary.org/works/${id}`,
          kind: 'source',
        },
      ],
    };
  }

  async getToc(): Promise<BookChapter[]> {
    return [];
  }

  async getChapter(): Promise<BookChapterContent> {
    throw new Error('Open Library reading is handled by the lending provider');
  }
}

function acquisitionFormat(type = ''): BookFormat | undefined {
  if (/epub/i.test(type)) return 'epub';
  if (/pdf/i.test(type)) return 'pdf';
  if (/plain|text/i.test(type)) return 'txt';
  if (/html/i.test(type)) return 'html';
  return undefined;
}

export class OpdsAdapter implements BookSourceAdapter {
  constructor(readonly config: BookSourceConfig) {}

  private async entries(
    signal: AbortSignal,
    query?: string
  ): Promise<OpdsEntry[]> {
    const template = query
      ? this.config.searchUrlTemplate
      : this.config.opdsUrl;
    if (!template) return [];
    const url = template.replace('{query}', encodeURIComponent(query || ''));
    const { text, contentType } = await safeFetchText(url, {
      signal,
      accept:
        'application/opds+json, application/atom+xml, application/xml, application/json',
    });
    return /json/i.test(contentType) || text.trim().startsWith('{')
      ? parseOpdsJson(JSON.parse(text))
      : parseOpdsXml(text);
  }

  private mapEntry(entry: OpdsEntry): BookResult {
    const acquisitions = entry.links.filter((link) =>
      /acquisition/.test(link.rel || '')
    );
    const formats = acquisitions
      .map((link) => acquisitionFormat(link.type))
      .filter((format): format is BookFormat => Boolean(format));
    return {
      id: base64UrlEncode(entry.id),
      source: this.config.key,
      sourceName: this.config.name,
      title: entry.title,
      authors: entry.authors.filter(Boolean),
      language: entry.language,
      cover: entry.cover
        ? new URL(entry.cover, this.config.baseUrl).toString()
        : undefined,
      description: entry.description,
      access: acquisitions.length ? 'fulltext' : 'metadata',
      formats: formats.length ? formats : ['external'],
      maturity: this.config.isMature ? 'mature' : 'unknown',
      attribution: this.config.rightsHolder,
      licenseUrl: this.config.licenseUrl,
    };
  }

  async search(
    query: string,
    options: BookSearchOptions,
    signal: AbortSignal
  ): Promise<BookResult[]> {
    const entries = await this.entries(signal, query);
    return entries
      .slice(0, options.limit || 20)
      .map((entry) => this.mapEntry(entry));
  }

  private async findEntry(id: string, signal: AbortSignal): Promise<OpdsEntry> {
    const rawId = base64UrlDecode(id);
    const entries = await this.entries(signal);
    const entry = entries.find((item) => item.id === rawId);
    if (!entry) throw new Error('OPDS entry not found');
    return entry;
  }

  async getDetail(id: string, signal: AbortSignal): Promise<BookDetail> {
    const entry = await this.findEntry(id, signal);
    const acquisitions = entry.links
      .map((link, index) => ({ link, index }))
      .filter(({ link }) => /acquisition/.test(link.rel || ''))
      .map(({ link }, index) => ({
        id: String(index),
        format: acquisitionFormat(link.type) || 'external',
        access: 'fulltext' as const,
        contentType: link.type,
      }));
    return {
      ...this.mapEntry(entry),
      sourceUrl: this.config.opdsUrl,
      acquisitions,
    };
  }

  async getToc(): Promise<BookChapter[]> {
    return [];
  }

  async getChapter(): Promise<BookChapterContent> {
    throw new Error('Use the OPDS acquisition endpoint for this format');
  }

  async getAcquisition(
    id: string,
    acquisitionId: string,
    signal: AbortSignal
  ): Promise<BookAcquisition> {
    const entry = await this.findEntry(id, signal);
    const links = entry.links.filter((link) =>
      /acquisition/.test(link.rel || '')
    );
    const index = Number(acquisitionId);
    const link = Number.isInteger(index) ? links[index] : undefined;
    if (!link?.href) throw new Error('OPDS acquisition not found');
    const format = acquisitionFormat(link.type);
    if (!format) throw new Error('Unsupported OPDS acquisition format');
    return {
      id: acquisitionId,
      format,
      access: 'fulltext',
      externalUrl: new URL(link.href, this.config.baseUrl).toString(),
      contentType: link.type,
    };
  }
}

export class AuthorizedHtmlAdapter implements BookSourceAdapter {
  constructor(readonly config: BookSourceConfig) {}

  private selectors() {
    if (!this.config.selectors) throw new Error('HTML selectors are missing');
    return this.config.selectors;
  }

  async search(
    query: string,
    options: BookSearchOptions,
    signal: AbortSignal
  ): Promise<BookResult[]> {
    requireHtmlRights(this.config);
    if (!this.config.searchUrlTemplate)
      throw new Error('Search URL is missing');
    const url = assertSourceUrl(
      this.config,
      this.config.searchUrlTemplate.replace(
        '{query}',
        encodeURIComponent(query)
      )
    );
    const { text } = await safeFetchText(url, { signal, accept: 'text/html' });
    const $ = cheerio.load(text);
    const selectors = this.selectors();
    return $(selectors.resultList)
      .slice(0, options.limit || 20)
      .map((_index, element) => {
        const row = $(element);
        const title = row.find(selectors.title).first().text().trim();
        const link = row.find(selectors.detailLink).first().attr('href');
        if (!title || !link) return undefined;
        const detailUrl = assertSourceUrl(this.config, link).toString();
        const coverValue = selectors.cover
          ? row.find(selectors.cover).first().attr('src')
          : undefined;
        return {
          id: base64UrlEncode(detailUrl),
          source: this.config.key,
          sourceName: this.config.name,
          title,
          authors: selectors.author
            ? [row.find(selectors.author).first().text().trim()].filter(Boolean)
            : [],
          language: this.config.language || 'zh',
          cover: coverValue
            ? assertSourceUrl(this.config, coverValue).toString()
            : undefined,
          description: selectors.description
            ? row.find(selectors.description).first().text().trim()
            : undefined,
          access: this.config.allowedUses?.displayFullText
            ? 'fulltext'
            : 'metadata',
          formats: this.config.allowedUses?.displayFullText
            ? ['html']
            : ['external'],
          maturity: this.config.isMature ? 'mature' : 'unknown',
          attribution: this.config.rightsHolder,
          licenseUrl: this.config.licenseUrl,
          externalLinks: [
            { label: '查看原站', url: detailUrl, kind: 'source' },
          ],
        } satisfies BookResult;
      })
      .get()
      .filter(Boolean) as unknown as BookResult[];
  }

  private detailUrl(id: string): string {
    return assertSourceUrl(this.config, base64UrlDecode(id)).toString();
  }

  async getDetail(id: string, signal: AbortSignal): Promise<BookDetail> {
    requireHtmlRights(this.config);
    const detailUrl = this.detailUrl(id);
    const { text } = await safeFetchText(detailUrl, {
      signal,
      accept: 'text/html',
    });
    const $ = cheerio.load(text);
    const selectors = this.selectors();
    const title = $(selectors.title).first().text().trim();
    if (!title) throw new Error('HTML source detail selector did not match');
    const coverValue = selectors.cover
      ? $(selectors.cover).first().attr('src')
      : undefined;
    return {
      id,
      source: this.config.key,
      sourceName: this.config.name,
      title,
      authors: selectors.author
        ? [$(selectors.author).first().text().trim()].filter(Boolean)
        : [],
      language: this.config.language || 'zh',
      cover: coverValue
        ? assertSourceUrl(this.config, coverValue).toString()
        : undefined,
      description: selectors.description
        ? $(selectors.description).first().text().trim()
        : undefined,
      access: this.config.allowedUses?.displayFullText
        ? 'fulltext'
        : 'metadata',
      formats: this.config.allowedUses?.displayFullText
        ? ['html']
        : ['external'],
      maturity: this.config.isMature ? 'mature' : 'unknown',
      attribution: this.config.rightsHolder,
      licenseUrl: this.config.licenseUrl,
      sourceUrl: detailUrl,
      externalLinks: [{ label: '查看原站', url: detailUrl, kind: 'source' }],
    };
  }

  async getToc(id: string, signal: AbortSignal): Promise<BookChapter[]> {
    requireHtmlRights(this.config, true);
    const detailUrl = this.detailUrl(id);
    const { text } = await safeFetchText(detailUrl, {
      signal,
      accept: 'text/html',
    });
    const $ = cheerio.load(text);
    const selectors = this.selectors();
    if (!selectors.tocList || !selectors.chapterLink) {
      return [{ id: base64UrlEncode(detailUrl), title: '全文', index: 0 }];
    }
    return $(selectors.tocList)
      .map((index, element) => {
        const row = $(element);
        const link = row.find(selectors.chapterLink!).first().attr('href');
        if (!link) return undefined;
        const chapterUrl = assertSourceUrl(this.config, link).toString();
        const title = selectors.chapterTitle
          ? row.find(selectors.chapterTitle).first().text().trim()
          : row.text().trim();
        return {
          id: base64UrlEncode(chapterUrl),
          title: title || `章节 ${index + 1}`,
          index,
        };
      })
      .get()
      .filter((item): item is BookChapter => Boolean(item));
  }

  async getChapter(
    id: string,
    chapterId: string,
    signal: AbortSignal
  ): Promise<BookChapterContent> {
    requireHtmlRights(this.config, true);
    this.detailUrl(id);
    const chapterUrl = assertSourceUrl(this.config, base64UrlDecode(chapterId));
    const { text } = await safeFetchText(chapterUrl, {
      signal,
      accept: 'text/html',
      maxBytes: 1024 * 1024,
    });
    const $ = cheerio.load(text);
    const selectors = this.selectors();
    if (!selectors.content)
      throw new Error('Chapter content selector is missing');
    const content = $(selectors.content).first();
    if (!content.length)
      throw new Error('Chapter content selector did not match');
    return {
      bookId: id,
      chapterId,
      title: selectors.chapterTitle
        ? $(selectors.chapterTitle).first().text().trim()
        : $('h1').first().text().trim() || '章节',
      format: 'html',
      html: cleanHtml(content.html() || ''),
      attribution: this.config.rightsHolder,
      licenseUrl: this.config.licenseUrl,
    };
  }
}

export function createBookAdapter(config: BookSourceConfig): BookSourceAdapter {
  if (config.key === 'wikisource-zh') return new WikisourceZhAdapter();
  if (config.key === 'google-books') return new GoogleBooksAdapter();
  if (config.key === 'open-library') return new OpenLibraryAdapter();
  if (config.type === 'opds') return new OpdsAdapter(config);
  if (config.type === 'html') return new AuthorizedHtmlAdapter(config);
  throw new Error(`Unsupported book source: ${config.key}`);
}

export function builtInBookSources(): BookSourceConfig[] {
  return [
    new WikisourceZhAdapter().config,
    new GoogleBooksAdapter().config,
    new OpenLibraryAdapter().config,
  ];
}

export function withOfficialSearchLinks(book: BookResult): BookResult {
  return {
    ...book,
    externalLinks: Array.from(
      new Map(
        [
          ...(book.externalLinks || []),
          ...officialBookSearchLinks(`${book.title} ${book.authors[0] || ''}`),
        ].map((link) => [link.url, link])
      ).values()
    ),
  };
}
