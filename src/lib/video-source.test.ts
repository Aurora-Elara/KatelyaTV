import {
  compareVideoSourceResults,
  createFailedVideoResult,
  findNextPlaybackSource,
  getPlaybackEvidenceTier,
  isTrailerTitle,
  sortSourcesByPlaybackResult,
  VideoSourceTestResult,
} from './video-source';

const success = (
  overrides: Partial<VideoSourceTestResult> = {}
): VideoSourceTestResult => ({
  status: 'ok',
  quality: '1080p',
  speedKBps: 2048,
  loadSpeed: '2.0 MB/s',
  pingTime: 80,
  startupTimeMs: 900,
  playable: true,
  message: '播放正常',
  hasError: false,
  ...overrides,
});

describe('video source ranking', () => {
  it('ranks measured, playable, unknown and failed results in order', () => {
    const measured = success();
    const playable = success({ speedKBps: 0, loadSpeed: '未知' });
    const failed = createFailedVideoResult('http', 'HTTP 403', {
      httpStatus: 403,
    });

    expect(getPlaybackEvidenceTier(measured)).toBe(0);
    expect(getPlaybackEvidenceTier(playable)).toBe(1);
    expect(getPlaybackEvidenceTier(undefined)).toBe(3);
    expect(getPlaybackEvidenceTier(failed)).toBe(4);
    expect(compareVideoSourceResults(measured, playable)).toBeLessThan(0);
  });

  it('keeps failed sources at the end and preserves the current source on ties', () => {
    const sources = [
      { id: '1', source: 'failed', title: 'A', poster: '', episodes: [], source_name: 'A', year: '' },
      { id: '2', source: 'current', title: 'A', poster: '', episodes: [], source_name: 'B', year: '' },
      { id: '3', source: 'unknown', title: 'A', poster: '', episodes: [], source_name: 'C', year: '' },
    ];
    const results = new Map([
      ['failed-1', createFailedVideoResult('network', '网络失败')],
    ]);

    expect(
      sortSourcesByPlaybackResult(sources, results, 'current-2').map(
        (source) => source.source
      )
    ).toEqual(['current', 'unknown', 'failed']);
  });

  it('recognizes explicit trailer titles without hiding regular titles', () => {
    expect(isTrailerTitle('大圣崛起预告片')).toBe(true);
    expect(isTrailerTitle('电影花絮')).toBe(true);
    expect(isTrailerTitle('仙逆')).toBe(false);
  });

  it('selects the next untried source for the current episode', () => {
    const sources = [
      { id: '1', source: 'current', title: 'A', poster: '', episodes: ['a.m3u8'], source_name: 'A', year: '' },
      { id: '2', source: 'failed', title: 'A', poster: '', episodes: ['b.m3u8'], source_name: 'B', year: '' },
      { id: '3', source: 'next', title: 'A', poster: '', episodes: ['c.m3u8'], source_name: 'C', year: '' },
    ];
    const results = new Map<string, VideoSourceTestResult>([
      ['failed-2', createFailedVideoResult('http', 'HTTP 403')],
      ['next-3', success({ status: 'partial', speedKBps: 0 })],
    ]);

    expect(
      findNextPlaybackSource(
        sources,
        results,
        new Set(['current-1']),
        0,
        'current-1'
      )?.source
    ).toBe('next');
  });

  it('returns null when every candidate failed or lacks the current episode', () => {
    const sources = [
      { id: '2', source: 'failed', title: 'A', poster: '', episodes: ['b.m3u8'], source_name: 'B', year: '' },
      { id: '3', source: 'short', title: 'A', poster: '', episodes: [], source_name: 'C', year: '' },
    ];
    const results = new Map<string, VideoSourceTestResult>([
      ['failed-2', createFailedVideoResult('network', '网络失败')],
    ]);

    expect(
      findNextPlaybackSource(
        sources,
        results,
        new Set(['failed-2']),
        0,
        'current-1'
      )
    ).toBeNull();
  });
});
