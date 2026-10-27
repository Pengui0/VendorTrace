/**
 * Hardened HTTP Client with Bounded Retries, Sane Timeouts, and Secret Redaction
 */

import { ProviderAppStatus, ProviderErrorCategory } from './types.js';

export interface HttpRequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: any;
  timeoutMs?: number;
  maxRetries?: number; // Bounded retries (default: 2 retries for transient errors)
  retryDelayMs?: number;
  signal?: AbortSignal;
}

export interface HttpResponseResult {
  ok: boolean;
  status: number;
  data: any;
  upstreamRequestId: string | null;
  latencyMs: number;
  appStatus: ProviderAppStatus;
  errorCategory: ProviderErrorCategory;
  errorMessage?: string;
}

/**
 * Extracts upstream request ID from response headers
 */
function extractRequestId(headers: Headers): string | null {
  return (
    headers.get('x-request-id') ||
    headers.get('request-id') ||
    headers.get('cf-ray') ||
    headers.get('x-amzn-trace-id') ||
    null
  );
}

/**
 * Redacts potential API keys or sensitive bearer tokens from strings
 */
export function redactSecrets(text: string): string {
  if (!text) return '';
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9_\-\.]{8,}/gi, '$1[REDACTED]')
    .replace(/(X-API-Key:\s*)[A-Za-z0-9_\-\.]{8,}/gi, '$1[REDACTED]')
    .replace(/([?&]api_?key=)[A-Za-z0-9_\-\.]{8,}/gi, '$1[REDACTED]')
    .replace(/((?:sk|tf)_[A-Za-z0-9_\-]{8,})/gi, '[REDACTED_KEY]')
    .replace(/(key\s+)[A-Za-z0-9_\-]{8,}/gi, '$1[REDACTED]');
}

/**
 * Sleep helper for bounded exponential backoff
 */
const delay = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) {
    reject(new Error('Request cancelled.'));
    return;
  }
  const timer = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, ms);
  const onAbort = () => {
    clearTimeout(timer);
    reject(new Error('Request cancelled.'));
  };
  signal?.addEventListener('abort', onAbort, { once: true });
});

/**
 * Executes an HTTP request with strict timeout, bounded transient retries, and error categorization.
 */
export async function executeHardenedRequest(
  url: string,
  options: HttpRequestOptions = {}
): Promise<HttpResponseResult> {
  const method = options.method || 'GET';
  const timeoutMs = options.timeoutMs ?? 7000; // Sane 7-second timeout
  const maxRetries = options.maxRetries ?? 2; // Maximum 2 retries for transient failures
  const baseDelay = options.retryDelayMs ?? 400;

  let attempt = 0;
  const startTime = Date.now();

  while (attempt <= maxRetries) {
    if (options.signal?.aborted) {
      return {
        ok: false,
        status: 0,
        data: null,
        upstreamRequestId: null,
        latencyMs: Date.now() - startTime,
        appStatus: 'UPSTREAM_UNAVAILABLE',
        errorCategory: 'TIMEOUT',
        errorMessage: 'Request cancelled.',
      };
    }
    const attemptStart = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abortFromCaller = () => controller.abort();
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });

    try {
      const response = await fetch(url, {
        method,
        headers: options.headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abortFromCaller);
      const attemptLatency = Date.now() - attemptStart;
      const upstreamRequestId = extractRequestId(response.headers);

      // Check HTTP status code
      if (response.ok) {
        let json: any = null;
        try {
          json = await response.json();
        } catch {
          json = {};
        }

        return {
          ok: true,
          status: response.status,
          data: json,
          upstreamRequestId,
          latencyMs: Date.now() - startTime,
          appStatus: 'LIVE',
          errorCategory: null,
        };
      }

      // Non-2xx response handling

      // 1. Authentication failure (HTTP 401, 403) -> DO NOT RETRY
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          status: response.status,
          data: null,
          upstreamRequestId,
          latencyMs: Date.now() - startTime,
          appStatus: 'AUTH_FAILED',
          errorCategory: 'AUTH',
          errorMessage: `Authentication failed (HTTP ${response.status}). Verify API key in server secrets.`,
        };
      }

      // 2. Billing / Wallet condition (HTTP 402 Payment Required) -> DO NOT RETRY
      if (response.status === 402) {
        return {
          ok: false,
          status: 402,
          data: null,
          upstreamRequestId,
          latencyMs: Date.now() - startTime,
          appStatus: 'BILLING_REQUIRED',
          errorCategory: 'BILLING',
          errorMessage: 'Account balance or credit quota exhausted (HTTP 402 Payment Required). Upstream wallet recharge required.',
        };
      }

      // 3. Rate limiting (HTTP 429) -> DO NOT RETRY
      if (response.status === 429) {
        return {
          ok: false,
          status: 429,
          data: null,
          upstreamRequestId,
          latencyMs: Date.now() - startTime,
          appStatus: 'RATE_LIMITED',
          errorCategory: 'RATE_LIMIT',
          errorMessage: 'Upstream rate limit exceeded (HTTP 429). Bounded throttle active.',
        };
      }

      // 4. Upstream transient errors (HTTP 502, 503, 504) -> BOUNDED RETRY
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        if (attempt < maxRetries) {
          attempt++;
          await delay(baseDelay * Math.pow(2, attempt - 1), options.signal);
          continue;
        }
        return {
          ok: false,
          status: response.status,
          data: null,
          upstreamRequestId,
          latencyMs: Date.now() - startTime,
          appStatus: 'UPSTREAM_UNAVAILABLE',
          errorCategory: 'UPSTREAM_5XX',
          errorMessage: `Upstream gateway error (HTTP ${response.status}) after ${maxRetries} retries.`,
        };
      }

      // Other 4xx or 500
      return {
        ok: false,
        status: response.status,
        data: null,
        upstreamRequestId,
        latencyMs: Date.now() - startTime,
        appStatus: 'UPSTREAM_UNAVAILABLE',
        errorCategory: response.status >= 500 ? 'UPSTREAM_5XX' : 'INVALID_INPUT',
        errorMessage: `Upstream returned HTTP ${response.status} ${response.statusText}`,
      };
    } catch (err: any) {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abortFromCaller);

      if (options.signal?.aborted) {
        return {
          ok: false,
          status: 0,
          data: null,
          upstreamRequestId: null,
          latencyMs: Date.now() - startTime,
          appStatus: 'UPSTREAM_UNAVAILABLE',
          errorCategory: 'TIMEOUT',
          errorMessage: 'Request cancelled.',
        };
      }

      // Timeout check
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        return {
          ok: false,
          status: 408,
          data: null,
          upstreamRequestId: null,
          latencyMs: Date.now() - startTime,
          appStatus: 'UPSTREAM_UNAVAILABLE',
          errorCategory: 'TIMEOUT',
          errorMessage: `Request timed out after ${timeoutMs}ms. Upstream service took too long to respond.`,
        };
      }

      // Transient network failure -> retry if within budget
      if (attempt < maxRetries) {
        attempt++;
        await delay(baseDelay * Math.pow(2, attempt - 1), options.signal);
        continue;
      }

      return {
        ok: false,
        status: 0,
        data: null,
        upstreamRequestId: null,
        latencyMs: Date.now() - startTime,
        appStatus: 'UPSTREAM_UNAVAILABLE',
        errorCategory: 'NETWORK',
        errorMessage: `Network error reaching upstream service: ${redactSecrets(err.message || String(err))}`,
      };
    }
  }

  // Fallback
  return {
    ok: false,
    status: 500,
    data: null,
    upstreamRequestId: null,
    latencyMs: Date.now() - startTime,
    appStatus: 'UPSTREAM_UNAVAILABLE',
    errorCategory: 'NETWORK',
    errorMessage: 'Maximum retries exhausted without response.',
  };
}
