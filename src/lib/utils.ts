/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import Hls from 'hls.js';

import {
  createFailedVideoResult,
  VideoSourceFailureKind,
  VideoSourceTestResult,
} from './video-source';

/**
 * 获取图片代理 URL 设置
 */
export function getImageProxyUrl(): string | null {
  if (typeof window === 'undefined') return null;

  // 本地未开启图片代理，则不使用代理
  const enableImageProxy = localStorage.getItem('enableImageProxy');
  if (enableImageProxy !== null) {
    if (!JSON.parse(enableImageProxy) as boolean) {
      return null;
    }
  }

  const localImageProxy = localStorage.getItem('imageProxyUrl');
  if (localImageProxy != null) {
    return localImageProxy.trim() ? localImageProxy.trim() : null;
  }

  // 如果未设置，则使用全局对象
  const serverImageProxy = (window as any).RUNTIME_CONFIG?.IMAGE_PROXY;
  return serverImageProxy && serverImageProxy.trim()
    ? serverImageProxy.trim()
    : null;
}

/**
 * 处理图片 URL，如果设置了图片代理则使用代理
 */
export function processImageUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  const proxyUrl = getImageProxyUrl();
  if (!proxyUrl) return originalUrl;

  return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
}

/**
 * 获取豆瓣代理 URL 设置
 */
export function getDoubanProxyUrl(): string | null {
  if (typeof window === 'undefined') return null;

  // 本地未开启豆瓣代理，则不使用代理
  const enableDoubanProxy = localStorage.getItem('enableDoubanProxy');
  if (enableDoubanProxy !== null) {
    if (!JSON.parse(enableDoubanProxy) as boolean) {
      return null;
    }
  }

  const localDoubanProxy = localStorage.getItem('doubanProxyUrl');
  if (localDoubanProxy != null) {
    return localDoubanProxy.trim() ? localDoubanProxy.trim() : null;
  }

  // 如果未设置，则使用全局对象
  const serverDoubanProxy = (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY;
  return serverDoubanProxy && serverDoubanProxy.trim()
    ? serverDoubanProxy.trim()
    : null;
}

/**
 * 处理豆瓣 URL，如果设置了豆瓣代理则使用代理
 */
export function processDoubanUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  const proxyUrl = getDoubanProxyUrl();
  if (!proxyUrl) return originalUrl;

  return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
}

export function cleanHtmlTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '\n') // 将 HTML 标签替换为换行
    .replace(/\n+/g, '\n') // 将多个连续换行合并为一个
    .replace(/[ \t]+/g, ' ') // 将多个连续空格和制表符合并为一个空格，但保留换行符
    .replace(/^\n+|\n+$/g, '') // 去掉首尾换行
    .replace(/&nbsp;/g, ' ') // 将 &nbsp; 替换为空格
    .trim(); // 去掉首尾空格
}

export interface VideoProbeOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

function qualityFromWidth(width: number): string {
  if (width >= 3840) return '4K';
  if (width >= 2560) return '2K';
  if (width >= 1920) return '1080p';
  if (width >= 1280) return '720p';
  if (width >= 854) return '480p';
  return width > 0 ? 'SD' : '未知';
}

function formatLoadSpeed(speedKBps: number): string {
  return speedKBps >= 1024
    ? `${(speedKBps / 1024).toFixed(1)} MB/s`
    : `${speedKBps.toFixed(1)} KB/s`;
}

function getHlsHttpStatus(data: any): number | undefined {
  const value = Number(
    data?.response?.code ||
      data?.response?.status ||
      data?.networkDetails?.status ||
      0
  );
  return value > 0 ? value : undefined;
}

export function createHlsFailureResult(
  data: any,
  startupTimeMs: number,
  pingTime = 0
): VideoSourceTestResult {
  const httpStatus = getHlsHttpStatus(data);
  const details = String(data?.details || '').toLowerCase();
  let failureKind: VideoSourceFailureKind = 'network';
  let message = '跨域或网络连接失败';

  if (httpStatus === 404 || httpStatus === 410) {
    failureKind = 'not_found';
    message = `播放资源不存在 (HTTP ${httpStatus})`;
  } else if (httpStatus) {
    failureKind = 'http';
    message =
      httpStatus === 401 || httpStatus === 403
        ? `来源拒绝访问 (HTTP ${httpStatus})`
        : httpStatus === 429
        ? '来源请求过于频繁 (HTTP 429)'
        : `来源返回 HTTP ${httpStatus}`;
  } else if (data?.type === Hls.ErrorTypes.MEDIA_ERROR) {
    failureKind = 'media';
    message = '浏览器无法解码该视频';
  } else if (details.includes('manifest') || details.includes('level')) {
    failureKind = 'manifest';
    message = '播放清单无效';
  } else if (details.includes('frag')) {
    failureKind = 'fragment';
    message = '媒体分片加载失败';
  }

  return createFailedVideoResult(failureKind, message, {
    httpStatus,
    pingTime: Math.round(pingTime),
    startupTimeMs: Math.round(startupTimeMs),
  });
}

/**
 * 使用浏览器实际 HLS 栈检测播放清单、首个分片和启动速度。
 */
export function getVideoResolutionFromM3u8(
  m3u8Url: string,
  options: VideoProbeOptions = {}
): Promise<VideoSourceTestResult> {
  const timeoutMs = options.timeoutMs || 8000;
  if (!m3u8Url) {
    return Promise.resolve(
      createFailedVideoResult('manifest', '播放地址为空')
    );
  }
  if (options.signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }
  if (!Hls.isSupported()) {
    return Promise.resolve(
      createFailedVideoResult('media', '当前浏览器不支持 HLS 播放')
    );
  }

  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const video = document.createElement('video');
    const controller = new AbortController();
    let settled = false;
    let pingTime = 0;
    let fragmentStartedAt = 0;
    let manifestLoaded = false;
    let metadataLoaded = false;
    let fragmentLoaded = false;
    let speedKBps = 0;
    let networkRecoveryCount = 0;
    let mediaRecoveryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    video.muted = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';

    const hls = new Hls({
      enableWorker: true,
      maxBufferLength: 2,
      manifestLoadingTimeOut: timeoutMs,
      levelLoadingTimeOut: timeoutMs,
      fragLoadingTimeOut: timeoutMs,
      manifestLoadingMaxRetry: 0,
      levelLoadingMaxRetry: 0,
      fragLoadingMaxRetry: 0,
    });

    const cleanup = () => {
      clearTimeout(timeout);
      if (retryTimer) clearTimeout(retryTimer);
      controller.abort();
      options.signal?.removeEventListener('abort', handleAbort);
      video.onloadedmetadata = null;
      video.onerror = null;
      hls.destroy();
      video.remove();
    };

    const finish = (result: VideoSourceTestResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const handleAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };

    const getDetectedWidth = () => {
      const levelWidth = hls.levels.reduce(
        (max, level) => Math.max(max, level.width || 0),
        0
      );
      return video.videoWidth || levelWidth;
    };

    const maybeFinish = () => {
      if (!manifestLoaded || (!metadataLoaded && !fragmentLoaded)) return;
      const startupTimeMs = performance.now() - startedAt;
      const measuredSpeed = Number.isFinite(speedKBps) ? speedKBps : 0;
      finish({
        status: fragmentLoaded ? 'ok' : 'partial',
        quality: qualityFromWidth(getDetectedWidth()),
        speedKBps: measuredSpeed,
        loadSpeed: measuredSpeed > 0 ? formatLoadSpeed(measuredSpeed) : '未知',
        pingTime: Math.round(pingTime),
        startupTimeMs: Math.round(startupTimeMs),
        playable: true,
        message: fragmentLoaded ? '播放正常' : '播放清单可用',
        hasError: false,
      });
    };

    const timeout = setTimeout(() => {
      finish(
        createFailedVideoResult('timeout', '播放检测超时', {
          pingTime: Math.round(pingTime),
          startupTimeMs: Math.round(performance.now() - startedAt),
        })
      );
    }, timeoutMs);

    options.signal?.addEventListener('abort', handleAbort, { once: true });

    const pingStartedAt = performance.now();
    fetch(m3u8Url, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
    })
      .catch(() => undefined)
      .finally(() => {
        pingTime = performance.now() - pingStartedAt;
      });

    hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(m3u8Url));
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      manifestLoaded = true;
      maybeFinish();
    });
    hls.on(Hls.Events.FRAG_LOADING, () => {
      if (!fragmentStartedAt) fragmentStartedAt = performance.now();
    });
    hls.on(Hls.Events.FRAG_LOADED, (_event, data: any) => {
      fragmentLoaded = true;
      const loadTimeMs = performance.now() - fragmentStartedAt;
      const size = Number(data?.payload?.byteLength || 0);
      if (fragmentStartedAt > 0 && loadTimeMs > 0 && size > 0) {
        speedKBps = size / 1024 / (loadTimeMs / 1000);
      }
      maybeFinish();
    });
    hls.on(Hls.Events.ERROR, (_event, data: any) => {
      if (!data?.fatal) return;
      const httpStatus = getHlsHttpStatus(data);
      const retryableNetworkError =
        data.type === Hls.ErrorTypes.NETWORK_ERROR &&
        (!httpStatus || httpStatus >= 500);

      if (retryableNetworkError && networkRecoveryCount < 1) {
        networkRecoveryCount += 1;
        retryTimer = setTimeout(() => hls.startLoad(), 500);
        return;
      }
      if (
        data.type === Hls.ErrorTypes.MEDIA_ERROR &&
        mediaRecoveryCount < 1
      ) {
        mediaRecoveryCount += 1;
        hls.recoverMediaError();
        return;
      }

      finish(
        createHlsFailureResult(
          data,
          performance.now() - startedAt,
          pingTime
        )
      );
    });

    video.onloadedmetadata = () => {
      metadataLoaded = true;
      maybeFinish();
    };
    video.onerror = () => {
      finish(
        createFailedVideoResult('media', '浏览器无法读取视频元数据', {
          pingTime: Math.round(pingTime),
          startupTimeMs: Math.round(performance.now() - startedAt),
        })
      );
    };

    hls.attachMedia(video);
  });
}
