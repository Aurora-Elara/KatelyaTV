import Hls from 'hls.js';

import { createHlsFailureResult } from './utils';

describe('createHlsFailureResult', () => {
  it.each([
    [403, 'http', '来源拒绝访问 (HTTP 403)'],
    [404, 'not_found', '播放资源不存在 (HTTP 404)'],
    [429, 'http', '来源请求过于频繁 (HTTP 429)'],
  ])('maps HTTP %i failures', (code, failureKind, message) => {
    const result = createHlsFailureResult(
      {
        type: Hls.ErrorTypes.NETWORK_ERROR,
        details: 'manifestLoadError',
        response: { code },
      },
      1200,
      80
    );

    expect(result).toMatchObject({
      status: 'failed',
      failureKind,
      httpStatus: code,
      message,
      playable: false,
      hasError: true,
    });
  });

  it.each([
    ['manifestLoadError', 'manifest', '播放清单无效'],
    ['fragLoadError', 'fragment', '媒体分片加载失败'],
  ])('maps %s failures', (details, failureKind, message) => {
    const result = createHlsFailureResult(
      { type: Hls.ErrorTypes.NETWORK_ERROR, details },
      1200
    );

    expect(result).toMatchObject({ failureKind, message });
  });

  it('maps fatal media failures', () => {
    const result = createHlsFailureResult(
      { type: Hls.ErrorTypes.MEDIA_ERROR, details: 'bufferAppendError' },
      1200
    );

    expect(result).toMatchObject({
      failureKind: 'media',
      message: '浏览器无法解码该视频',
    });
  });
});
