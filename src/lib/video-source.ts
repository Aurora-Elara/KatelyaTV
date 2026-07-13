import { SearchResult } from './types';

export type VideoSourceStatus = 'ok' | 'partial' | 'failed';

export type VideoSourceFailureKind =
  | 'http'
  | 'not_found'
  | 'manifest'
  | 'fragment'
  | 'timeout'
  | 'network'
  | 'media';

export interface VideoSourceTestResult {
  status: VideoSourceStatus;
  failureKind?: VideoSourceFailureKind;
  httpStatus?: number;
  quality: string;
  speedKBps: number;
  loadSpeed: string;
  pingTime: number;
  startupTimeMs: number;
  playable: boolean;
  message: string;
  hasError: boolean;
}

const QUALITY_RANK: Record<string, number> = {
  '4K': 6,
  '2K': 5,
  '1080p': 4,
  '720p': 3,
  '480p': 2,
  SD: 1,
  未知: 0,
};

export function createFailedVideoResult(
  failureKind: VideoSourceFailureKind,
  message: string,
  options: { httpStatus?: number; pingTime?: number; startupTimeMs?: number } = {}
): VideoSourceTestResult {
  return {
    status: 'failed',
    failureKind,
    httpStatus: options.httpStatus,
    quality: '错误',
    speedKBps: 0,
    loadSpeed: '未知',
    pingTime: options.pingTime || 0,
    startupTimeMs: options.startupTimeMs || 0,
    playable: false,
    message,
    hasError: true,
  };
}

export function hasMeasuredMediaThroughput(
  result: VideoSourceTestResult | undefined
): boolean {
  return Boolean(
    result &&
      !result.hasError &&
      Number.isFinite(result.speedKBps) &&
      result.speedKBps > 0
  );
}

export function getPlaybackEvidenceTier(
  result: VideoSourceTestResult | undefined
): number {
  if (!result) return 3;
  if (result.hasError || result.status === 'failed') return 4;
  if (hasMeasuredMediaThroughput(result)) return 0;
  if (result.status === 'ok' && result.playable) return 1;
  if (result.status === 'partial' || result.pingTime > 0) return 2;
  return 3;
}

function comparePositiveLowerFirst(
  a: number | undefined,
  b: number | undefined
): number {
  const hasA = typeof a === 'number' && Number.isFinite(a) && a > 0;
  const hasB = typeof b === 'number' && Number.isFinite(b) && b > 0;
  if (hasA !== hasB) return hasA ? -1 : 1;
  return hasA && hasB ? (a as number) - (b as number) : 0;
}

export function compareVideoSourceResults(
  a: VideoSourceTestResult | undefined,
  b: VideoSourceTestResult | undefined
): number {
  const tierDifference = getPlaybackEvidenceTier(a) - getPlaybackEvidenceTier(b);
  if (tierDifference !== 0) return tierDifference;
  if (!a || !b) return 0;

  const startupDifference = comparePositiveLowerFirst(
    a.startupTimeMs,
    b.startupTimeMs
  );
  if (Math.abs(startupDifference) > 750) return startupDifference;

  const speedDifference = b.speedKBps - a.speedKBps;
  if (speedDifference !== 0) return speedDifference;

  const qualityDifference =
    (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0);
  if (qualityDifference !== 0) return qualityDifference;
  if (startupDifference !== 0) return startupDifference;
  return comparePositiveLowerFirst(a.pingTime, b.pingTime);
}

export function sortSourcesByPlaybackResult(
  sources: SearchResult[],
  results: Map<string, VideoSourceTestResult>,
  currentKey?: string
): SearchResult[] {
  return [...sources].sort((a, b) => {
    const aKey = `${a.source}-${a.id}`;
    const bKey = `${b.source}-${b.id}`;
    const result = compareVideoSourceResults(results.get(aKey), results.get(bKey));
    if (result !== 0) return result;
    if (aKey === currentKey && bKey !== currentKey) return -1;
    if (bKey === currentKey && aKey !== currentKey) return 1;
    return 0;
  });
}

export function findNextPlaybackSource(
  sources: SearchResult[],
  results: Map<string, VideoSourceTestResult>,
  failedKeys: Set<string>,
  episodeIndex: number,
  currentKey: string
): SearchResult | null {
  return (
    sortSourcesByPlaybackResult(sources, results).find((source) => {
      const key = `${source.source}-${source.id}`;
      return (
        key !== currentKey &&
        !failedKeys.has(key) &&
        Boolean(source.episodes?.[episodeIndex]) &&
        !results.get(key)?.hasError
      );
    }) || null
  );
}

export function isTrailerTitle(title: string): boolean {
  return /(预告片|先导片|预热视频|花絮)/.test(title);
}
