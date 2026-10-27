/**
 * Server-Side TinyFish Web Agent Client
 * Strictly reads TINYFISH_API_KEY from server environment/secrets.
 * Uses official X-API-Key authentication header and enforces output_schema validation.
 */

import { redactSecrets } from './httpClient.js';
import { validateTopLevelJsonSchema } from '../validation/riskFindingValidator.js';

export type TinyFishTestStatus =
  | 'SUCCESS'
  | 'NOT_CONFIGURED'
  | 'AUTH_ERROR'
  | 'INSUFFICIENT_CREDITS'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'CANCELED'
  | 'UPSTREAM_ERROR'
  | 'INVALID_RESPONSE'
  | 'FAILED';

export interface TinyFishBaselineResult {
  title: string;
  heading: string;
  summary: string;
  [key: string]: any;
}

export interface TinyFishTestResponse {
  status: TinyFishTestStatus;
  result: TinyFishBaselineResult | null;
  elapsedMs: number;
  diagnosticMessage: string;
  upstreamRunId?: string | null;
  providerConnected?: boolean;
  agentStatus?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  isMock: boolean;
}

const DEFAULT_AGENT_TIMEOUT_MS = 90000;
const MAX_AGENT_TIMEOUT_MS = 120000;
const POLL_INTERVAL_MS = 1000;
const CANCELLATION_TIMEOUT_MS = 5000;

export const BASELINE_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['title', 'heading', 'summary'],
  properties: {
    title: { type: 'string' },
    heading: { type: 'string' },
    summary: { type: 'string' },
  },
};

export class TinyFishClient {
  private agentBaseUrl: string;

  constructor() {
    this.agentBaseUrl = (process.env.TINYFISH_AGENT_URL || 'https://agent.tinyfish.ai').replace(/\/+$/, '');
  }

  private getApiKey(): string | null {
    const key = process.env.TINYFISH_API_KEY;
    return key && key.trim().length > 0 ? key.trim() : null;
  }

  public isConfigured(): boolean {
    return this.getApiKey() !== null;
  }

  /**
   * Validates that the returned result matches the required output_schema.
   */
  public validateBaselineResult(result: any): { valid: boolean; error?: string } {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return { valid: false, error: 'Upstream result is null, missing, or not a JSON object.' };
    }
    for (const field of BASELINE_OUTPUT_SCHEMA.required) {
      if (typeof result[field] !== 'string') {
        return { valid: false, error: `Result object is missing required string field '${field}'.` };
      }
    }
    if (result.title.trim().length === 0) {
      return { valid: false, error: "Result object is missing required string field 'title'." };
    }
    return { valid: true };
  }

  /**
   * Executes a baseline integration test using TinyFish automation.
   */
  public async runBaselineTest(options: {
    useMock?: boolean;
    url?: string;
    goal?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    mockScenario?: 'SUCCESS' | 'NULL_RESULT' | 'INVALID_SCHEMA' | 'AUTH_ERROR' | 'INSUFFICIENT_CREDITS' | 'RATE_LIMITED' | 'TIMEOUT' | 'UPSTREAM_500';
  } = {}): Promise<TinyFishTestResponse> {
    const startTime = Date.now();
    const targetUrl = options.url || 'https://example.com';
    const goal = [
      options.goal?.trim() || 'Extract page information into structured JSON.',
      'Return title as the page title, heading as the primary H1 or top heading, and summary as a brief 1-2 sentence description of the page content. All three fields must be strings.',
    ].join(' ');
    const requestedTimeoutMs = options.timeoutMs;
    const timeoutMs = typeof requestedTimeoutMs === 'number' && Number.isFinite(requestedTimeoutMs)
      ? Math.min(Math.max(requestedTimeoutMs, 1), MAX_AGENT_TIMEOUT_MS)
      : DEFAULT_AGENT_TIMEOUT_MS;

    // 1. MOCK TEST PATH (No network calls)
    if (options.useMock) {
      const scenario = options.mockScenario || 'SUCCESS';
      const elapsedMs = 85;

      switch (scenario) {
        case 'AUTH_ERROR':
          return {
            status: 'AUTH_ERROR',
            result: null,
            elapsedMs,
            diagnosticMessage: 'Authentication failed (HTTP 401). Verify TINYFISH_API_KEY in server secrets.',
            isMock: true,
          };
        case 'INSUFFICIENT_CREDITS':
          return {
            status: 'INSUFFICIENT_CREDITS',
            result: null,
            elapsedMs,
            diagnosticMessage: 'TinyFish wallet balance or credit quota exhausted (HTTP 402 / BILLING_FAILURE).',
            isMock: true,
          };
        case 'RATE_LIMITED':
          return {
            status: 'RATE_LIMITED',
            result: null,
            elapsedMs,
            diagnosticMessage: 'TinyFish rate limit exceeded (HTTP 429). Too many concurrent automations.',
            isMock: true,
          };
        case 'TIMEOUT':
          return {
            status: 'TIMEOUT',
            result: null,
            elapsedMs: timeoutMs,
            diagnosticMessage: `TinyFish automation run timed out after ${timeoutMs}ms.`,
            isMock: true,
          };
        case 'UPSTREAM_500':
          return {
            status: 'UPSTREAM_ERROR',
            result: null,
            elapsedMs,
            diagnosticMessage: 'Upstream TinyFish server error (HTTP 500). Internal service error.',
            isMock: true,
          };
        case 'NULL_RESULT':
          // Upstream reported COMPLETED, but result was null
          return {
            status: 'INVALID_RESPONSE',
            result: null,
            elapsedMs,
            diagnosticMessage: 'Upstream automation status reported COMPLETED, but result payload was null.',
            upstreamRunId: 'mock_tf_run_null_01',
            isMock: true,
          };
        case 'INVALID_SCHEMA':
          // Upstream returned result without title
          return {
            status: 'INVALID_RESPONSE',
            result: { incorrectField: 123 } as any,
            elapsedMs,
            diagnosticMessage: "Upstream result failed output_schema validation: missing required field 'title'.",
            upstreamRunId: 'mock_tf_run_inv_02',
            isMock: true,
          };
        case 'SUCCESS':
        default:
          return {
            status: 'SUCCESS',
            result: {
              title: 'Example Domain',
              heading: 'Example Domain',
              summary: 'This domain is for use in illustrative examples in documents without prior coordination.',
            },
            elapsedMs,
            diagnosticMessage: 'Mock automation run succeeded. Extracted schema validated cleanly.',
            upstreamRunId: 'mock_tf_run_success_03',
            isMock: true,
          };
      }
    }

    // 2. LIVE NETWORK PATH
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        status: 'NOT_CONFIGURED',
        result: null,
        elapsedMs: Date.now() - startTime,
        diagnosticMessage: 'TINYFISH_API_KEY is not configured in server environment secrets.',
        providerConnected: false,
        isMock: false,
      };
    }

    const endpoint = `${this.agentBaseUrl}/v1/automation/run-async`;
    const controller = new AbortController();
    const deadline = Date.now() + timeoutMs;
    let timedOut = false;
    let callerCancelled = false;
    let runId: string | null = null;
    let agentStatus: TinyFishTestResponse['agentStatus'];
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abortFromCaller = () => {
      callerCancelled = true;
      controller.abort();
    };
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    if (options.signal?.aborted) abortFromCaller();

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          url: targetUrl,
          goal,
          output_schema: BASELINE_OUTPUT_SCHEMA,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const providerError = await this.readProviderError(response);
        return this.liveFailureResponse(response.status, providerError, Date.now() - startTime);
      }

      const queued = await this.readJsonResponse(response);
      if (!queued.valid || !queued.data || typeof queued.data !== 'object' || Array.isArray(queued.data)) {
        return {
          status: 'INVALID_RESPONSE',
          result: null,
          elapsedMs: Date.now() - startTime,
          diagnosticMessage: queued.valid ? 'TinyFish run-async response was not a JSON object.' : queued.error,
          providerConnected: true,
          isMock: false,
        };
      }

      if (queued.data.error) {
        const providerError = queued.data.error as Record<string, unknown>;
        return this.liveFailureResponse(
          200,
          typeof providerError.message === 'string' ? providerError.message : 'TinyFish rejected the automation run.',
          Date.now() - startTime,
          providerError
        );
      }

      if (typeof queued.data.run_id !== 'string' || queued.data.run_id.trim().length === 0) {
        return {
          status: 'INVALID_RESPONSE',
          result: null,
          elapsedMs: Date.now() - startTime,
          diagnosticMessage: 'TinyFish run-async response did not include a valid run_id.',
          providerConnected: true,
          isMock: false,
        };
      }

      const actualRunId: string = queued.data.run_id;
      runId = actualRunId;
      agentStatus = 'PENDING';
      const pollUrl = `${this.agentBaseUrl}/v1/runs/${encodeURIComponent(actualRunId)}`;

      while (Date.now() < deadline) {
        const pollResponse = await fetch(pollUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'X-API-Key': apiKey,
          },
          signal: controller.signal,
        });

        if (!pollResponse.ok) {
          const providerError = await this.readProviderError(pollResponse);
          return this.liveFailureResponse(
            pollResponse.status,
            providerError,
            Date.now() - startTime,
            undefined,
            runId,
            agentStatus
          );
        }

        const polled = await this.readJsonResponse(pollResponse);
        if (!polled.valid || !polled.data || typeof polled.data !== 'object' || Array.isArray(polled.data)) {
          return {
            status: 'INVALID_RESPONSE',
            result: null,
            elapsedMs: Date.now() - startTime,
            diagnosticMessage: polled.valid ? 'TinyFish run status response was not a JSON object.' : polled.error,
            upstreamRunId: runId,
            providerConnected: true,
            agentStatus,
            isMock: false,
          };
        }

        const status = polled.data.status;
        if (status === 'PENDING' || status === 'RUNNING') {
          agentStatus = status;
          await this.waitForNextPoll(Math.min(POLL_INTERVAL_MS, Math.max(deadline - Date.now(), 0)), controller.signal);
          continue;
        }

        if (status === 'COMPLETED') {
          const validation = this.validateBaselineResult(polled.data.result);
          if (!validation.valid) {
            return {
              status: 'INVALID_RESPONSE',
              result: null,
              elapsedMs: Date.now() - startTime,
              diagnosticMessage: `Automation reported COMPLETED, but result failed schema validation: ${validation.error}`,
              upstreamRunId: runId,
              providerConnected: true,
              agentStatus: 'COMPLETED',
              isMock: false,
            };
          }
          return {
            status: 'SUCCESS',
            result: polled.data.result,
            elapsedMs: Date.now() - startTime,
            diagnosticMessage: 'Live TinyFish automation completed successfully. Extracted schema validated cleanly.',
            upstreamRunId: runId,
            providerConnected: true,
            agentStatus: 'COMPLETED',
            isMock: false,
          };
        }

        if (status === 'FAILED') {
          agentStatus = 'FAILED';
          const providerError = polled.data.error && typeof polled.data.error === 'object'
            ? polled.data.error as Record<string, unknown>
            : undefined;
          return this.liveFailureResponse(
            200,
            typeof providerError?.message === 'string' ? providerError.message : 'TinyFish automation run failed.',
            Date.now() - startTime,
            providerError,
            runId,
            agentStatus
          );
        }

        if (status === 'CANCELLED') {
          return {
            status: 'CANCELED',
            result: null,
            elapsedMs: Date.now() - startTime,
            diagnosticMessage: 'TinyFish automation run was cancelled.',
            upstreamRunId: runId,
            providerConnected: true,
            agentStatus: 'CANCELLED',
            isMock: false,
          };
        }

        return {
          status: 'INVALID_RESPONSE',
          result: null,
          elapsedMs: Date.now() - startTime,
          diagnosticMessage: 'TinyFish run status response contained an unsupported status.',
          upstreamRunId: runId,
          providerConnected: true,
          agentStatus,
          isMock: false,
        };
      }

      timedOut = true;
      controller.abort();
      await this.cancelUpstreamRun(actualRunId, apiKey);
      return {
        status: 'TIMEOUT',
        result: null,
        elapsedMs: Date.now() - startTime,
        diagnosticMessage: `TinyFish automation run timed out after ${timeoutMs}ms and cancellation was requested.`,
        upstreamRunId: runId,
        providerConnected: true,
        agentStatus,
        isMock: false,
      };
    } catch (err: any) {
      if (timedOut || Date.now() >= deadline) {
        if (runId) await this.cancelUpstreamRun(runId, apiKey);
        return {
          status: 'TIMEOUT',
          result: null,
          elapsedMs: Date.now() - startTime,
          diagnosticMessage: runId
            ? `TinyFish automation run timed out after ${timeoutMs}ms and cancellation was requested.`
            : `TinyFish automation request timed out after ${timeoutMs}ms.`,
          upstreamRunId: runId,
          providerConnected: runId !== null,
          agentStatus,
          isMock: false,
        };
      }
      if (callerCancelled) {
        if (runId) await this.cancelUpstreamRun(runId, apiKey);
        return {
          status: 'CANCELED',
          result: null,
          elapsedMs: Date.now() - startTime,
          diagnosticMessage: 'TinyFish automation run was cancelled because the client disconnected.',
          upstreamRunId: runId,
          providerConnected: runId !== null,
          agentStatus,
          isMock: false,
        };
      }

      return {
        status: 'UPSTREAM_ERROR',
        result: null,
        elapsedMs: Date.now() - startTime,
        diagnosticMessage: `Network error connecting to TinyFish agent API: ${redactSecrets(err.message || String(err))}`,
        upstreamRunId: runId,
        providerConnected: runId !== null,
        agentStatus,
        isMock: false,
      };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  private async readJsonResponse(response: Response): Promise<
    { valid: true; data: any } | { valid: false; error: string }
  > {
    try {
      return { valid: true, data: await response.json() };
    } catch {
      return { valid: false, error: 'TinyFish returned a malformed JSON response.' };
    }
  }

  private async readProviderError(response: Response): Promise<string> {
    try {
      const data = await response.json();
      return redactSecrets(
        typeof data.error?.message === 'string'
          ? data.error.message
          : `TinyFish returned HTTP ${response.status} ${response.statusText}.`
      );
    } catch {
      return `TinyFish returned HTTP ${response.status} ${response.statusText}.`;
    }
  }

  private liveFailureResponse(
    httpStatus: number,
    message: string,
    elapsedMs: number,
    error?: Record<string, unknown>,
    runId?: string | null,
    agentStatus?: TinyFishTestResponse['agentStatus']
  ): TinyFishTestResponse {
    const category = String(error?.category || '').toUpperCase();
    const code = String(error?.code || '').toUpperCase();
    const status: TinyFishTestStatus =
      httpStatus === 401 || httpStatus === 403 ? 'AUTH_ERROR'
        : httpStatus === 402 || category.includes('BILLING') || code.includes('INSUFFICIENT_FUNDS') || code.includes('BILLING') ? 'INSUFFICIENT_CREDITS'
        : httpStatus === 429 ? 'RATE_LIMITED'
        : httpStatus >= 500 || httpStatus === 200 ? 'UPSTREAM_ERROR'
        : 'FAILED';
    return {
      status,
      result: null,
      elapsedMs,
      diagnosticMessage: redactSecrets(message),
      upstreamRunId: runId || null,
      providerConnected: true,
      agentStatus,
      isMock: false,
    };
  }

  private async waitForNextPoll(ms: number, signal: AbortSignal): Promise<void> {
    if (ms <= 0) return;
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error('TinyFish agent polling was aborted.'));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  private async cancelUpstreamRun(runId: string, apiKey: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CANCELLATION_TIMEOUT_MS);
    try {
      await fetch(`${this.agentBaseUrl}/v1/runs/${encodeURIComponent(runId)}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        signal: controller.signal,
      });
    } catch {
      // The timeout or disconnect response remains authoritative if cancellation cannot be confirmed.
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Runs structured agent extraction using official TinyFish output_schema capability.
   * Enforces that output_schema is a strict top-level JSON object.
   */
  public async runStructuredAgentExtraction<T = any>(options: {
    url: string;
    goal: string;
    outputSchema: any;
    timeoutMs?: number;
    useMock?: boolean;
    mockResult?: T;
  }): Promise<{
    success: boolean;
    status: TinyFishTestStatus;
    result: T | null;
    elapsedMs: number;
    diagnosticMessage: string;
    upstreamRunId?: string | null;
    isMock: boolean;
  }> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || 12000;

    // Validate that output_schema is a top-level JSON object
    const schemaValidation = validateTopLevelJsonSchema(options.outputSchema);
    if (!schemaValidation.valid) {
      return {
        success: false,
        status: 'INVALID_RESPONSE',
        result: null,
        elapsedMs: 0,
        diagnosticMessage: schemaValidation.error || 'Invalid output_schema',
        isMock: Boolean(options.useMock),
      };
    }

    // Mock path for deterministic offline testing and fixtures
    if (options.useMock) {
      return {
        success: true,
        status: 'SUCCESS',
        result: options.mockResult || null,
        elapsedMs: 45,
        diagnosticMessage: 'Mock structured extraction successful.',
        upstreamRunId: 'mock_tf_struct_run',
        isMock: true,
      };
    }

    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        result: null,
        elapsedMs: Date.now() - startTime,
        diagnosticMessage: 'TINYFISH_API_KEY is missing from server environment secrets.',
        isMock: false,
      };
    }

    const endpoint = `${this.agentBaseUrl}/v1/automation/run`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          url: options.url,
          goal: options.goal,
          output_schema: options.outputSchema,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const elapsedMs = Date.now() - startTime;
      const upstreamRunId = response.headers.get('x-request-id') || null;

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status} ${response.statusText}`;
        try {
          const errData = await response.json();
          if (errData.error?.message) errorMsg = errData.error.message;
        } catch {
          // ignore
        }
        return {
          success: false,
          status: response.status === 401 ? 'AUTH_ERROR' : response.status === 402 ? 'INSUFFICIENT_CREDITS' : response.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_ERROR',
          result: null,
          elapsedMs,
          diagnosticMessage: redactSecrets(errorMsg),
          upstreamRunId,
          isMock: false,
        };
      }

      const data = await response.json();
      if (!data.result || typeof data.result !== 'object') {
        return {
          success: false,
          status: 'INVALID_RESPONSE',
          result: null,
          elapsedMs,
          diagnosticMessage: 'TinyFish automation result is missing or not a JSON object.',
          upstreamRunId,
          isMock: false,
        };
      }

      return {
        success: true,
        status: 'SUCCESS',
        result: data.result as T,
        elapsedMs,
        diagnosticMessage: 'Live TinyFish structured extraction validated cleanly.',
        upstreamRunId,
        isMock: false,
      };
    } catch (err: any) {
      clearTimeout(timer);
      const elapsedMs = Date.now() - startTime;
      const isTimeout = err.name === 'AbortError' || err.message?.includes('aborted');

      return {
        success: false,
        status: isTimeout ? 'TIMEOUT' : 'UPSTREAM_ERROR',
        result: null,
        elapsedMs,
        diagnosticMessage: isTimeout
          ? `TinyFish automation run timed out after ${timeoutMs}ms.`
          : redactSecrets(err.message || String(err)),
        isMock: false,
      };
    }
  }
}

export const tinyfishClient = new TinyFishClient();
