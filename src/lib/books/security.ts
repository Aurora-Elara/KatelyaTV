import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest, RequestOptions } from 'node:https';
import { isIP } from 'node:net';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const value = address.toLowerCase();
  return (
    value === '::' ||
    value === '::1' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    /^fe[89ab]/.test(value) ||
    value.startsWith('::ffff:127.') ||
    value.startsWith('::ffff:10.') ||
    value.startsWith('::ffff:192.168.') ||
    value.startsWith('::ffff:169.254.')
  );
}

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  return version === 4
    ? isPrivateIpv4(address)
    : version === 6
    ? isPrivateIpv6(address)
    : true;
}

export async function assertSafeBookUrl(input: string | URL): Promise<URL> {
  return (await resolveSafeBookUrl(input)).url;
}

async function resolveSafeBookUrl(input: string | URL): Promise<{
  url: URL;
  addresses: LookupAddress[];
}> {
  const url = input instanceof URL ? input : new URL(input);
  if (url.protocol !== 'https:') {
    throw new Error('Book sources must use HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('Credential URLs are not allowed');
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === 'metadata.google.internal'
  ) {
    throw new Error('Local and metadata hosts are blocked');
  }
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error('Private network addresses are blocked');
    }
    return { url, addresses: [{ address: hostname, family: isIP(hostname) }] };
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => isPrivateAddress(address))
  ) {
    throw new Error('The source does not resolve to a public address');
  }
  return { url, addresses };
}

export interface SafeBookResponse {
  status: number;
  headers: Headers;
}

interface PinnedResponse extends SafeBookResponse {
  bytes: Uint8Array;
  finalUrl: string;
}

function createPinnedLookup(
  addresses: LookupAddress[]
): NonNullable<RequestOptions['lookup']> {
  return (_hostname, options, callback) => {
    const requestedFamily =
      typeof options === 'number' ? options : options.family || 0;
    const candidates = requestedFamily
      ? addresses.filter(({ family }) => family === requestedFamily)
      : addresses;
    if (!candidates.length) {
      const error = new Error('No validated address for requested family');
      (error as NodeJS.ErrnoException).code = 'ENOTFOUND';
      callback(error as NodeJS.ErrnoException, '', 0);
      return;
    }
    if (typeof options === 'object' && options.all) {
      callback(null, candidates);
      return;
    }
    callback(null, candidates[0].address, candidates[0].family);
  };
}

function requestPinned(
  url: URL,
  signal: AbortSignal,
  headers: HeadersInit,
  addresses: LookupAddress[],
  maxBytes: number
): Promise<SafeBookResponse & { bytes: Uint8Array }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value: SafeBookResponse & { bytes: Uint8Array }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const requestHeaders = Object.fromEntries(new Headers(headers).entries());
    const request = httpsRequest(
      {
        protocol: 'https:',
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: requestHeaders,
        lookup: createPinnedLookup(addresses),
        servername: url.hostname,
        agent: false,
      },
      (response) => {
        const responseHeaders = new Headers();
        for (let index = 0; index < response.rawHeaders.length; index += 2) {
          responseHeaders.append(
            response.rawHeaders[index],
            response.rawHeaders[index + 1]
          );
        }
        const status = response.statusCode || 0;
        const contentLength = Number(
          responseHeaders.get('content-length') || 0
        );
        if (contentLength > maxBytes) {
          response.destroy();
          fail(new Error('Source response is too large'));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        response.on('data', (chunk: Buffer) => {
          total += chunk.byteLength;
          if (total > maxBytes) {
            response.destroy();
            fail(new Error('Source response is too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.once('end', () =>
          finish({
            status,
            headers: responseHeaders,
            bytes: new Uint8Array(Buffer.concat(chunks)),
          })
        );
        response.once('error', fail);
        response.once('aborted', () =>
          fail(new Error('Source response aborted'))
        );
      }
    );
    const abort = () =>
      request.destroy(
        new DOMException('The operation was aborted', 'AbortError')
      );
    signal.addEventListener('abort', abort, { once: true });
    request.once('close', () => signal.removeEventListener('abort', abort));
    request.once('error', fail);
    request.end();
  });
}

async function fetchWithRedirects(
  input: URL,
  signal: AbortSignal,
  headers: HeadersInit,
  maxBytes: number,
  redirectCount = 0
): Promise<PinnedResponse> {
  if (redirectCount > MAX_REDIRECTS) throw new Error('Too many redirects');
  const { url, addresses } = await resolveSafeBookUrl(input);
  const response = await requestPinned(
    url,
    signal,
    headers,
    addresses,
    maxBytes
  );
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new Error('Redirect response has no location');
    return fetchWithRedirects(
      new URL(location, url),
      signal,
      headers,
      maxBytes,
      redirectCount + 1
    );
  }
  return { ...response, finalUrl: url.toString() };
}

export interface SafeFetchOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  accept?: string;
  userAgent?: string;
}

export async function safeFetchBytes(
  input: string | URL,
  options: SafeFetchOptions = {}
): Promise<{
  response: SafeBookResponse;
  bytes: Uint8Array;
  finalUrl: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  const relayAbort = () => controller.abort();
  options.signal?.addEventListener('abort', relayAbort, { once: true });
  try {
    const url = input instanceof URL ? input : new URL(input);
    const response = await fetchWithRedirects(
      url,
      controller.signal,
      {
        Accept: options.accept || '*/*',
        'User-Agent':
          options.userAgent ||
          `KatelyaTV/1.0 (+https://katelyatv.com; ${
            process.env.BOOK_SOURCE_CONTACT || 'contact unavailable'
          })`,
      },
      options.maxBytes ?? DEFAULT_MAX_BYTES
    );
    if (response.status < 200 || response.status >= 300)
      throw new Error(`Source returned HTTP ${response.status}`);
    const { bytes, finalUrl } = response;
    return { response, bytes, finalUrl };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', relayAbort);
  }
}

export async function safeFetchText(
  input: string | URL,
  options: SafeFetchOptions = {}
): Promise<{ text: string; contentType: string; finalUrl: string }> {
  const { response, bytes, finalUrl } = await safeFetchBytes(input, options);
  const contentType = response.headers.get('content-type') || '';
  const charset = /charset=([^;]+)/i
    .exec(contentType)?.[1]
    ?.trim()
    .toLowerCase();
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset || 'utf-8');
  } catch {
    decoder = new TextDecoder('utf-8');
  }
  return { text: decoder.decode(bytes), contentType, finalUrl };
}
