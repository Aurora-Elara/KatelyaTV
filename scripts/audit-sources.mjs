import { readFile } from 'node:fs/promises';

const config = JSON.parse(
  await readFile(new URL('./source-candidates.json', import.meta.url), 'utf8')
);

const REQUEST_TIMEOUT_MS = 8000;
const M3U8_PATTERN = /https?:\/\/[^"'\s]+?\.m3u8[^"'\s]*/i;

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      redirect: 'follow',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function findMediaUrl(item) {
  return String(item?.vod_play_url || '').match(M3U8_PATTERN)?.[0] || '';
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function auditSource(source) {
  const url = new URL(source.api);
  const result = {
    key: source.key,
    api: source.api,
    expectedTier: source.expectedTier,
    https: url.protocol === 'https:',
    json: false,
    queryHits: 0,
    queryHonored: true,
    detail: false,
    manifest: false,
    segment: false,
    cors: false,
    recommendation: 'reject',
    errors: [],
  };

  if (!result.https) {
    result.errors.push('API is not HTTPS');
    return result;
  }

  let sample;
  for (const query of config.queries) {
    try {
      const response = await fetchWithTimeout(
        `${source.api}?ac=videolist&wd=${encodeURIComponent(query)}`
      );
      if (!response.ok) {
        result.errors.push(`${query}: HTTP ${response.status}`);
        continue;
      }
      const data = await readJson(response);
      if (!data) {
        result.errors.push(`${query}: response body is not JSON`);
        continue;
      }
      result.json = true;
      const list = Array.isArray(data?.list) ? data.list : [];
      const normalizedQuery = query.replace(/\s+/g, '');
      const matched = list.filter((item) =>
        String(item?.vod_name || '')
          .replace(/\s+/g, '')
          .includes(normalizedQuery)
      );
      if (list.length > 0 && matched.length === 0) result.queryHonored = false;
      if (matched.length > 0) {
        result.queryHits += 1;
        sample ||= matched.find((item) => findMediaUrl(item)) || matched[0];
      }
    } catch (error) {
      result.errors.push(
        `${query}: ${error instanceof Error ? error.message : 'failed'}`
      );
    }
  }

  if (!sample?.vod_id) return result;

  try {
    const response = await fetchWithTimeout(
      `${source.api}?ac=videolist&ids=${encodeURIComponent(sample.vod_id)}`
    );
    const data = response.ok ? await readJson(response) : null;
    const item = Array.isArray(data?.list) ? data.list[0] : null;
    result.detail = Boolean(item);
    const mediaUrl = findMediaUrl(item || sample);
    if (!mediaUrl) return result;

    const manifestResponse = await fetchWithTimeout(mediaUrl, {
      headers: { Range: 'bytes=0-65535' },
    });
    const manifestText = manifestResponse.ok
      ? await manifestResponse.text()
      : '';
    result.manifest = manifestResponse.ok && manifestText.includes('#EXTM3U');
    result.cors =
      manifestResponse.headers.get('access-control-allow-origin') === '*' ||
      Boolean(manifestResponse.headers.get('access-control-allow-origin'));

    const segmentLine = manifestText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'));
    if (segmentLine) {
      const segmentUrl = new URL(segmentLine, mediaUrl).toString();
      const segmentResponse = await fetchWithTimeout(segmentUrl, {
        headers: { Range: 'bytes=0-1023' },
      });
      result.segment = segmentResponse.ok;
      result.cors =
        result.cors &&
        (segmentResponse.headers.get('access-control-allow-origin') === '*' ||
          Boolean(segmentResponse.headers.get('access-control-allow-origin')));
    }
  } catch (error) {
    result.errors.push(
      error instanceof Error ? error.message : 'media check failed'
    );
  }

  if (
    result.queryHits >= 2 &&
    result.queryHonored &&
    result.detail &&
    result.manifest &&
    result.segment &&
    result.cors
  ) {
    result.recommendation = 'primary';
  } else if (result.queryHits >= 2 && result.queryHonored && result.detail) {
    result.recommendation = 'discovery';
  }

  return result;
}

const seenHosts = new Set();
const results = [];
for (const source of config.sources) {
  const host = new URL(source.api).host.toLowerCase();
  if (seenHosts.has(host)) {
    results.push({
      key: source.key,
      api: source.api,
      recommendation: 'reject',
      errors: ['duplicate API host'],
    });
    continue;
  }
  seenHosts.add(host);
  results.push(await auditSource(source));
}

process.stdout.write(
  `${JSON.stringify(
    { auditedAt: new Date().toISOString(), results },
    null,
    2
  )}\n`
);
