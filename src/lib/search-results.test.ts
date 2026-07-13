import {
  getCanonicalResultKey,
  getMediaKind,
  mergeUniqueResults,
  normalizeTitle,
} from './search-results';

const result = (title: string, source: string, episodes: string[] = ['a']) => ({
  id: source,
  title,
  source,
  source_name: source,
  poster: '',
  episodes,
  year: '2026',
});

describe('progressive search result helpers', () => {
  it('normalizes full-width characters, spaces and punctuation', () => {
    expect(normalizeTitle('仙 逆：第 2 季')).toBe(normalizeTitle('仙逆 第2季'));
  });

  it('keeps movie and episodic results in separate canonical groups', () => {
    expect(getCanonicalResultKey(result('测试', 'a'))).not.toBe(
      getCanonicalResultKey(result('测试', 'b', ['1', '2']))
    );
  });

  it('normalizes Chinese and English season labels to the same group', () => {
    expect(getCanonicalResultKey(result('三体 第二季', 'a', ['1', '2']))).toBe(
      getCanonicalResultKey(result('三体 Season 2', 'b', ['1', '2']))
    );
  });

  it('uses the declared category when search results omit episodes', () => {
    expect(
      getMediaKind({ ...result('测试', 'a', []), type_name: '动漫' })
    ).toBe('anime');
    expect(getMediaKind({ ...result('测试', 'b', []), class: '纪录片' })).toBe(
      'documentary'
    );
  });

  it('deduplicates repeated source ids while retaining distinct sources', () => {
    expect(
      mergeUniqueResults(
        [result('测试', 'a')],
        [result('测试更新', 'a'), result('测试', 'b')]
      ).map((item) => item.source)
    ).toEqual(['a', 'b']);
  });
});
