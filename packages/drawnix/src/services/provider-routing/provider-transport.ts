import type {
  PreparedProviderTransportRequest,
  ProviderBaseUrlStrategy,
  ProviderTransportRequest,
  ResolvedProviderContext,
} from './types';
import {
  isTrustedTuziApiBaseUrl,
  loadTuziApiEndpointBaseUrls,
  normalizeTuziApiEndpointUrl,
} from './tuzi-api-endpoints';

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * DEV-ONLY: 把匹配的 API 站绝对 URL 改写为同源相对路径，
 * 让请求走 vite dev proxy，规避浏览器对自定义头（如 X-Request-Id）的 CORS 拦截。
 *
 * 生产环境（import.meta.env.PROD）该逻辑不生效。
 * 需与 apps/web/vite.config.ts 中的 server.proxy 配置配套使用。
 */
const DEV_PROXY_HOSTS: readonly string[] = ['api.tu-zi.com'];

function rewriteBaseUrlForDevProxy(baseUrl: string): string {
  try {
    const isDev =
      typeof import.meta !== 'undefined' &&
      (import.meta as { env?: { DEV?: boolean; MODE?: string } }).env?.DEV &&
      (import.meta as { env?: { MODE?: string } }).env?.MODE !== 'test';
    if (!isDev) return baseUrl;
    if (!/^https?:\/\//i.test(baseUrl)) return baseUrl;

    const parsed = new URL(baseUrl);
    if (!DEV_PROXY_HOSTS.includes(parsed.host)) return baseUrl;
    // 只保留 pathname（如 /v1），改写为同源相对路径
    return parsed.pathname.replace(/\/+$/, '');
  } catch {
    return baseUrl;
  }
}

function applyBaseUrlStrategy(
  baseUrl: string,
  strategy: ProviderBaseUrlStrategy = 'preserve'
): string {
  const rewritten = rewriteBaseUrlForDevProxy(baseUrl);
  const normalizedBaseUrl = trimTrailingSlashes(rewritten);

  switch (strategy) {
    case 'trim-v1':
      return normalizedBaseUrl.replace(/\/v1$/i, '');
    case 'preserve':
    default:
      return normalizedBaseUrl;
  }
}

function joinUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedBase = trimTrailingSlashes(baseUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function getBaseUrlPathSuffix(baseUrl: string): string {
  try {
    const parsed = new URL(trimTrailingSlashes(baseUrl));
    return parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function isFetchNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /Failed to fetch|Load failed|NetworkError/i.test(error.message);
}

async function getTuziFallbackBaseUrls(baseUrl: string): Promise<string[]> {
  if (!isTrustedTuziApiBaseUrl(baseUrl)) {
    return [];
  }

  const currentOrigin = normalizeTuziApiEndpointUrl(baseUrl);
  const currentPathSuffix = getBaseUrlPathSuffix(baseUrl);
  const tuziOrigins = await loadTuziApiEndpointBaseUrls();

  if (!tuziOrigins.includes(currentOrigin)) {
    return [];
  }

  return tuziOrigins
    .filter((origin) => origin !== currentOrigin)
    .map((origin) => `${origin}${currentPathSuffix}`);
}

function buildQueryString(
  query?: Record<string, string | number | boolean | null | undefined>
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || key.trim() === '') {
      continue;
    }
    params.set(key, String(value));
  }

  const result = params.toString();
  return result ? `?${result}` : '';
}

function mergeHeaders(
  baseHeaders?: Record<string, string>,
  overrideHeaders?: Record<string, string>
): Record<string, string> {
  return {
    ...(baseHeaders || {}),
    ...(overrideHeaders || {}),
  };
}

function applyAuthHeaders(
  context: ResolvedProviderContext,
  headers: Record<string, string>
): Record<string, string> {
  if (!context.apiKey) {
    return headers;
  }

  switch (context.authType) {
    case 'bearer':
      return { ...headers, Authorization: `Bearer ${context.apiKey}` };
    case 'header':
      if (
        headers.Authorization ||
        headers.authorization ||
        headers['X-API-Key'] ||
        headers['x-api-key']
      ) {
        return headers;
      }
      return { ...headers, 'X-API-Key': context.apiKey };
    case 'custom':
    case 'query':
    default:
      return headers;
  }
}

function applyAuthQuery(
  context: ResolvedProviderContext,
  query: Record<string, string | number | boolean | null | undefined>
): Record<string, string | number | boolean | null | undefined> {
  if (!context.apiKey || context.authType !== 'query') {
    return query;
  }

  if (query.api_key !== undefined || query.key !== undefined) {
    return query;
  }

  const authQueryKey =
    context.providerType === 'gemini-compatible' ? 'key' : 'api_key';

  return {
    ...query,
    [authQueryKey]: context.apiKey,
  };
}

function createTimeoutSignal(
  upstreamSignal: AbortSignal | undefined,
  timeoutMs: number | undefined
): {
  signal: AbortSignal | undefined;
  didTimeout: () => boolean;
  cleanup: () => void;
} {
  if (!timeoutMs || timeoutMs <= 0) {
    return {
      signal: upstreamSignal,
      didTimeout: () => false,
      cleanup: () => undefined,
    };
  }

  const controller = new AbortController();
  let didTimeout = false;

  const abortFromUpstream = () => {
    controller.abort(upstreamSignal?.reason);
  };

  if (upstreamSignal?.aborted) {
    controller.abort(upstreamSignal.reason);
  } else if (upstreamSignal) {
    upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true });
  }

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    const error = new Error(`Request timeout after ${timeoutMs}ms`);
    error.name = 'TimeoutError';
    controller.abort(error);
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    cleanup: () => {
      clearTimeout(timeoutId);
      upstreamSignal?.removeEventListener('abort', abortFromUpstream);
    },
  };
}

function applyRequestIdHeader(
  headers: Record<string, string>,
  requestId: string | undefined
): Record<string, string> {
  if (!requestId) {
    return headers;
  }
  return { ...headers, 'X-Request-Id': requestId };
}

export class ProviderTransport {
  prepareRequest(
    context: ResolvedProviderContext,
    request: ProviderTransportRequest
  ): PreparedProviderTransportRequest {
    const mergedHeaders = mergeHeaders(context.extraHeaders, request.headers);
    const authenticatedHeaders = applyAuthHeaders(context, mergedHeaders);
    const finalHeaders = applyRequestIdHeader(
      authenticatedHeaders,
      request.requestId
    );
    const query = applyAuthQuery(context, request.query || {});
    const resolvedBaseUrl = applyBaseUrlStrategy(
      context.baseUrl,
      request.baseUrlStrategy
    );
    const url = `${joinUrl(resolvedBaseUrl, request.path)}${buildQueryString(
      query
    )}`;

    return {
      url,
      headers: finalHeaders,
      init: {
        method: request.method || 'GET',
        headers: finalHeaders,
        body: request.body,
        signal: request.signal,
        credentials: request.credentials,
      },
    };
  }

  async send(
    context: ResolvedProviderContext,
    request: ProviderTransportRequest
  ): Promise<Response> {
    const timeoutControl = createTimeoutSignal(
      request.signal,
      request.timeoutMs
    );
    const prepared = this.prepareRequest(context, {
      ...request,
      signal: timeoutControl.signal,
    });
    const fetcher = request.fetcher || fetch;

    try {
      return await fetcher(prepared.url, prepared.init);
    } catch (error) {
      if (timeoutControl.didTimeout()) {
        const timeoutMinutes = Math.floor((request.timeoutMs || 0) / 60000);
        const timeoutError: Error & { requestId?: string } = new Error(
          `请求超时（>${timeoutMinutes} 分钟）`
        );
        timeoutError.name = 'TimeoutError';
        if (request.requestId) {
          timeoutError.requestId = request.requestId;
        }
        throw timeoutError;
      }
      if (isFetchNetworkError(error)) {
        const fallbackBaseUrls = await getTuziFallbackBaseUrls(context.baseUrl);

        for (const fallbackBaseUrl of fallbackBaseUrls) {
          const fallbackPrepared = this.prepareRequest(
            { ...context, baseUrl: fallbackBaseUrl },
            { ...request, signal: timeoutControl.signal }
          );
          try {
            return await fetcher(fallbackPrepared.url, fallbackPrepared.init);
          } catch (fallbackError) {
            if (
              timeoutControl.didTimeout() ||
              !isFetchNetworkError(fallbackError)
            ) {
              throw fallbackError;
            }
          }
        }
      }
      throw error;
    } finally {
      timeoutControl.cleanup();
    }
  }
}

export const providerTransport = new ProviderTransport();
