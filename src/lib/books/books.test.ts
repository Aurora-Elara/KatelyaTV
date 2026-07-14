import { mergeAndRankBooks, normalizeBookText } from './normalize';
import { parseOpdsJson, parseOpdsXml } from './opds';
import { requireHtmlRights } from './rights';
import { assertSafeBookUrl } from './security';
import { BookResult, BookSourceConfig } from './types';

const book = (overrides: Partial<BookResult>): BookResult => ({
  id: '1',
  source: 'metadata',
  sourceName: 'Metadata',
  title: '红楼梦',
  authors: ['曹雪芹'],
  language: 'zh',
  access: 'metadata',
  formats: ['external'],
  maturity: 'unknown',
  ...overrides,
});

describe('book normalization and ranking', () => {
  it('normalizes full-width punctuation and spacing', () => {
    expect(normalizeBookText(' 红 楼 梦：第一卷 ')).toBe('红楼梦第一卷');
  });

  it('deduplicates ISBN and prefers full text', () => {
    const result = mergeAndRankBooks(
      [
        [book({ isbn13: '9787020002207' })],
        [
          book({
            id: '2',
            source: 'wikisource-zh',
            sourceName: '中文维基文库',
            isbn13: '978-7-0200-0220-7',
            access: 'fulltext',
            formats: ['html'],
          }),
        ],
      ],
      '红楼梦'
    );
    expect(result).toHaveLength(1);
    expect(result[0].access).toBe('fulltext');
  });
});

describe('OPDS parsers', () => {
  it('parses OPDS 2 publications', () => {
    const entries = parseOpdsJson({
      publications: [
        {
          metadata: {
            identifier: 'urn:1',
            title: '测试书',
            author: [{ name: '作者' }],
          },
          links: [
            {
              href: '/book.epub',
              type: 'application/epub+zip',
              rel: 'http://opds-spec.org/acquisition',
            },
          ],
        },
      ],
    });
    expect(entries[0].title).toBe('测试书');
    expect(entries[0].authors).toEqual(['作者']);
  });

  it('parses OPDS 1 Atom entries', () => {
    const entries = parseOpdsXml(
      '<?xml version="1.0"?><feed><entry><id>urn:2</id><title>开放图书</title><author><name>作者乙</name></author><link rel="http://opds-spec.org/acquisition" type="text/plain" href="book.txt"/></entry></feed>'
    );
    expect(entries[0].id).toBe('urn:2');
    expect(entries[0].links[0].href).toBe('book.txt');
  });
});

describe('authorized HTML sources', () => {
  const pendingSource: BookSourceConfig = {
    key: 'pending-source',
    name: 'Pending',
    type: 'html',
    status: 'pending',
    baseUrl: 'https://example.com/',
    searchUrlTemplate: 'https://example.com/search?q={query}',
    selectors: {
      resultList: '.item',
      title: '.title',
      detailLink: 'a',
    },
  };

  it('refuses an unreviewed source before network access', async () => {
    expect(() => requireHtmlRights(pendingSource)).toThrow('not enabled');
  });

  it('blocks direct private addresses', async () => {
    await expect(assertSafeBookUrl('https://127.0.0.1/book')).rejects.toThrow(
      'Private network'
    );
  });
});
