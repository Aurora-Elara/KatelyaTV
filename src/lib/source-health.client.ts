import { VideoSourceTestResult } from './video-source';

interface PlaybackHealthReport {
  sourceKey: string;
  success: boolean;
  failureKind?: VideoSourceTestResult['failureKind'];
  startupTimeMs?: number;
  speedKBps?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
  browserCompatible?: boolean;
}

const queue: PlaybackHealthReport[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

async function flush() {
  flushTimer = undefined;
  const reports = queue.splice(0, 10);
  if (reports.length === 0) return;
  try {
    await fetch('/api/source-health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reports }),
      keepalive: true,
    });
  } catch {
    // Health telemetry is best-effort and must never block playback.
  }
  if (queue.length > 0 && !flushTimer) flushTimer = setTimeout(flush, 1500);
}

export function reportPlaybackHealth(
  sourceKey: string,
  result: VideoSourceTestResult
) {
  queue.push({
    sourceKey,
    success: result.playable && !result.hasError,
    failureKind: result.failureKind,
    startupTimeMs: result.startupTimeMs,
    speedKBps: result.speedKBps,
    height: result.height,
    videoCodec: result.videoCodec,
    audioCodec: result.audioCodec,
    browserCompatible: result.browserCompatible,
  });
  if (!flushTimer) flushTimer = setTimeout(flush, 1500);
}
