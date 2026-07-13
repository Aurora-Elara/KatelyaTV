import { SourceHealthScore } from './types';

export interface SourceHealthTotals {
  searchOk: number;
  searchCount: number;
  searchLatencyTotal: number;
  playbackOk: number;
  playbackCount: number;
  startupTotal: number;
  startupCount: number;
  speedTotal: number;
  speedCount: number;
  heightTotal: number;
  heightCount: number;
  updatedAt: number;
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function calculateSourceHealthScore(
  totals: SourceHealthTotals,
  now = Date.now()
): SourceHealthScore {
  const searchSuccessRate =
    totals.searchCount > 0 ? totals.searchOk / totals.searchCount : 0.5;
  const playbackSuccessRate =
    totals.playbackCount > 0 ? totals.playbackOk / totals.playbackCount : 0.5;
  const averageLatency =
    totals.searchCount > 0
      ? totals.searchLatencyTotal / totals.searchCount
      : 3000;
  const averageStartup =
    totals.startupCount > 0 ? totals.startupTotal / totals.startupCount : 3500;
  const averageSpeed =
    totals.speedCount > 0 ? totals.speedTotal / totals.speedCount : 1500;
  const averageHeight =
    totals.heightCount > 0 ? totals.heightTotal / totals.heightCount : 720;
  const latencyScore = clamp(100 - ((averageLatency - 1500) / 4500) * 100);
  const startupScore = clamp(100 - ((averageStartup - 1000) / 5000) * 100);
  const speedScore = clamp(averageSpeed / 50);
  const qualityScore = clamp((averageHeight / 2160) * 100);
  const searchScore = clamp(searchSuccessRate * 70 + latencyScore * 0.3);
  const playbackScore = clamp(
    playbackSuccessRate * 55 +
      startupScore * 0.2 +
      speedScore * 0.15 +
      qualityScore * 0.1
  );
  const ageHours =
    totals.updatedAt > 0 ? (now - totals.updatedAt) / 3600000 : 168;
  const freshnessScore = clamp(100 - (ageHours / 168) * 100);

  return {
    searchScore: Math.round(searchScore),
    playbackScore: Math.round(playbackScore),
    overallScore: Math.round(
      playbackScore * 0.65 + searchScore * 0.25 + freshnessScore * 0.1
    ),
    searchSuccessRate,
    playbackSuccessRate,
    updatedAt: totals.updatedAt,
  };
}
