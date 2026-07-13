import { ApiSite, SearchResult } from './types';

export type SourceTier = 'primary' | 'discovery';

export interface ProgressiveSourceEvent {
  type: 'source';
  source: string;
  tier: SourceTier;
  results: SearchResult[];
  elapsedMs: number;
}

export interface ProgressiveProgressEvent {
  type: 'progress';
  completed: number;
  total: number;
}

export interface ProgressiveDoneEvent {
  type: 'done';
  completed: number;
  total: number;
  timedOut: boolean;
}

export type ProgressiveSearchEvent =
  | ProgressiveSourceEvent
  | ProgressiveProgressEvent
  | ProgressiveDoneEvent;

export function getSourceTier(source: Pick<ApiSite, 'tier'>): SourceTier {
  return source.tier === 'discovery' ? 'discovery' : 'primary';
}

export function normalizeTitle(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function parseSeasonNumber(value: string): string {
  if (/^\d+$/.test(value)) return String(Number(value));
  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (value === '十') return '10';
  const [tens, ones] = value.split('十');
  if (value.includes('十')) {
    return String((digits[tens] || 1) * 10 + (digits[ones] || 0));
  }
  return digits[value] === undefined ? value : String(digits[value]);
}

export function getMediaKind(
  result: SearchResult
): 'movie' | 'tv' | 'anime' | 'variety' | 'documentary' | 'short' {
  const category = `${result.type_name || ''} ${
    result.class || ''
  }`.toLowerCase();
  if (/动漫|动画|anime/.test(category)) return 'anime';
  if (/综艺|variety/.test(category)) return 'variety';
  if (/纪录|documentary/.test(category)) return 'documentary';
  if (/短剧|短片|short/.test(category)) return 'short';
  if (/电影|movie/.test(category)) return 'movie';
  if (/电视|连续剧|剧集|\btv\b/.test(category)) return 'tv';
  return result.episodes.length > 1 ? 'tv' : 'movie';
}

export function getCanonicalResultKey(result: SearchResult): string {
  const seasonPattern =
    /(?:第\s*)?([0-9零一二两三四五六七八九十]+)\s*季|season\s*(\d+)|\bs\s*(\d+)\b/i;
  const season = result.title.match(seasonPattern);
  const rawSeason = season?.slice(1).find(Boolean) || '';
  const seasonNumber = rawSeason ? parseSeasonNumber(rawSeason) : '';
  const baseTitle = result.title.replace(seasonPattern, '');
  return `${normalizeTitle(baseTitle)}:${seasonNumber}:${getMediaKind(result)}`;
}

export function mergeUniqueResults(
  current: SearchResult[],
  incoming: SearchResult[]
): SearchResult[] {
  const map = new Map(
    current.map((item) => [`${item.source}:${item.id}`, item] as const)
  );
  incoming.forEach((item) => map.set(`${item.source}:${item.id}`, item));
  return Array.from(map.values());
}
