/**
 * Server-Side TinyFish Streaming Client & Event Sanitizer
 * Interfaces with official TinyFish /v1/automation/run-sse streaming endpoint.
 * Strictly keeps TINYFISH_API_KEY server-side.
 * Sanitizes event summaries and provides honest polling fallback on stream disconnects.
 */

import { redactSecrets } from './httpClient.js';
import { validateTopLevelJsonSchema } from '../validation/riskFindingValidator.js';
import { ProviderErrorCategory } from './types.js';

const CANCELLATION_TIMEOUT_MS = 5000;
const STREAM_CONNECT_TIMEOUT_MS = 10000;

export type TinyFishStreamEventType =
  | 'STARTED'
  | 'STREAMING_URL'
  | 'PROGRESS'
  | 'COMPLETE'
  | 'ERROR'
  | 'CANCELED'
  | 'POLLING_FALLBACK';

export interface SanitizedStreamEvent {
  type: TinyFishStreamEventType;
  runId: string;
  timestamp: string;
  streamingUrl?: string | null;
  message?: string;
  purpose?: string;
  elapsedMs?: number;
  status?: 'COMPLETED' | 'FAILED' | 'RUNNING' | 'CANCELED' | 'UNKNOWN';
  result?: any;
  errorCategory?: ProviderErrorCategory;
  errorMessage?: string;
  isMock: boolean;
}

export interface StreamAutomationOptions {
  url: string;
  goal: string;
  outputSchema?: any;
  timeoutMs?: number;
  signal?: AbortSignal;
  useMock?: boolean;
  mockScenario?:
    | 'STANDARD'
    | 'DISCONNECTED_STREAM'
    | 'MISSING_STREAMING_URL'
    | 'PARTIAL_PROGRESS'
    | 'COMPLETION_WITHOUT_RESULT'
    | 'CANCELLATION'
    | 'RECONNECT_POLLING_FALLBACK';
}

export class TinyFishStreamingClient {
  private agentBaseUrl: string;
  private activeControllers = new Map<string, AbortController>();
  private activeRunMetadata = new Map<string, { status: string; streamingUrl?: string | null; result?: any }>();

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
   * Validates if a streaming URL is a genuine HTTPS TinyFish browser feed URL.
   * Prevents guessed or fabricated URLs.
   */
  public isValidTinyFishStreamingUrl(url: string | null | undefined): boolean {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed.startsWith('https://')) return false;

    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.toLowerCase();
      // Verified domains used by TinyFish for browser feed sessions
      return (
        host.endsWith('.tinyfish.ai') ||
        host.endsWith('.unikraft.app') ||
        host === 'agent.tinyfish.ai'
      );
    } catch {
      return false;
    }
  }

  /**
   * Sanitizes string values to prevent secret leakage or raw script injection.
   */
  public sanitizeText(text: string | null | undefined): string {
    if (!text) return '';
    return redactSecrets(String(text))
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[REMOVED_SCRIPT]')
      .replace(/[<>]/g, (tag) => (tag === '<' ? '&lt;' : '&gt;'))
      .trim();
  }

  /**
   * Cancels an active automation run via documented cancel endpoint.
   */
  public async cancelRun(runId: string, useMock = false): Promise<{ success: boolean; message: string }> {
    const controller = this.activeControllers.get(runId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(runId);
    }

    this.activeRunMetadata.set(runId, { status: 'CANCELED' });

    if (!this.isConfigured() || useMock || runId.startsWith('tf_test_') || runId.startsWith('mock_')) {
      return { success: true, message: `Run ${runId} cancelled locally (mock/unconfigured mode).` };
    }

    try {
      const cancelUrl = `${this.agentBaseUrl}/v1/runs/${encodeURIComponent(runId)}/cancel`;
      const cancelController = new AbortController();
      const timeout = setTimeout(() => cancelController.abort(), CANCELLATION_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(cancelUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.getApiKey()!,
          },
          signal: cancelController.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      return {
        success: res.ok,
        message: res.ok ? `Run ${runId} cancelled successfully upstream.` : `Cancel failed with status ${res.status}.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Error requesting run cancellation: ${this.sanitizeText(err.message)}`,
      };
    }
  }

  /**
   * Honest polling fallback over the documented run lifecycle when streaming drops.
   */
  public async pollRunStatus(runId: string, useMock = false, signal?: AbortSignal): Promise<SanitizedStreamEvent> {
    const now = new Date().toISOString();

    if (signal?.aborted) {
      return {
        type: 'CANCELED',
        runId,
        timestamp: now,
        status: 'CANCELED',
        message: 'Automation cancelled by client.',
        isMock: useMock,
      };
    }

    if (useMock) {
      const existing = this.activeRunMetadata.get(runId);
      if (existing && existing.status === 'COMPLETED') {
        return {
          type: 'COMPLETE',
          runId,
          timestamp: now,
          status: 'COMPLETED',
          streamingUrl: existing.streamingUrl,
          result: existing.result,
          isMock: true,
        };
      }
      return {
        type: 'PROGRESS',
        runId,
        timestamp: now,
        status: 'RUNNING',
        message: 'Polling fallback: Browser automation task currently executing.',
        isMock: true,
      };
    }

    if (!this.isConfigured()) {
      return {
        type: 'ERROR',
        runId,
        timestamp: now,
        errorCategory: 'NOT_CONFIGURED',
        errorMessage: 'TINYFISH_API_KEY is not configured in server environment secrets.',
        isMock: false,
      };
    }

    try {
      const pollUrl = `${this.agentBaseUrl}/v1/runs/${encodeURIComponent(runId)}`;
      const res = await fetch(pollUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-API-Key': this.getApiKey()!,
        },
        signal,
      });

      if (!res.ok) {
        return {
          type: 'ERROR',
          runId,
          timestamp: now,
          errorCategory: res.status === 401 ? 'AUTH' : res.status === 404 ? 'INVALID_INPUT' : 'UPSTREAM_5XX',
          errorMessage: `Upstream polling check returned HTTP ${res.status}.`,
          isMock: false,
        };
      }

      const data = await res.json();
      const status = data.status === 'COMPLETED' ? 'COMPLETED' : data.status === 'FAILED' ? 'FAILED' : 'RUNNING';

      if (status === 'COMPLETED') {
        return {
          type: 'COMPLETE',
          runId,
          timestamp: now,
          status: 'COMPLETED',
          streamingUrl: this.isValidTinyFishStreamingUrl(data.streaming_url) ? data.streaming_url : null,
          result: data.result || null,
          isMock: false,
        };
      }

      return {
        type: 'PROGRESS',
        runId,
        timestamp: now,
        status,
        message: this.sanitizeText(data.message || data.progress || 'Agent in progress'),
        streamingUrl: this.isValidTinyFishStreamingUrl(data.streaming_url) ? data.streaming_url : null,
        isMock: false,
      };
    } catch (err: any) {
      return {
        type: 'ERROR',
        runId,
        timestamp: now,
        errorCategory: 'NETWORK',
        errorMessage: `Polling error: ${this.sanitizeText(err.message)}`,
        isMock: false,
      };
    }
  }

  /**
   * Executes streaming automation run against official /v1/automation/run-sse.
   * Pushes sanitized events to onEvent callback in real time.
   */
  public async executeStreamingRun(
    options: StreamAutomationOptions,
    onEvent: (event: SanitizedStreamEvent) => void
  ): Promise<void> {
    const startTime = Date.now();
    const timeoutMs = Math.min(options.timeoutMs || 120000, 120000);
    const runId = `tf_run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Validate top-level schema if provided
    if (options.outputSchema) {
      const validation = validateTopLevelJsonSchema(options.outputSchema);
      if (!validation.valid) {
        onEvent({
          type: 'ERROR',
          runId,
          timestamp: new Date().toISOString(),
          errorCategory: 'INVALID_INPUT',
          errorMessage: validation.error || 'output_schema must be a top-level JSON object',
          isMock: Boolean(options.useMock),
        });
        return;
      }
    }

    // 1. MOCK & TESTING STREAMING PATH
    if (options.useMock) {
      await this.runMockStreamingScenario(runId, options, startTime, onEvent);
      return;
    }

    // 2. LIVE NETWORK STREAMING PATH
    const apiKey = this.getApiKey();
    if (!apiKey) {
      onEvent({
        type: 'ERROR',
        runId,
        timestamp: new Date().toISOString(),
        errorCategory: 'NOT_CONFIGURED',
        errorMessage: 'TINYFISH_API_KEY is missing from server environment secrets.',
        isMock: false,
      });
      return;
    }

    const endpoint = `${this.agentBaseUrl}/v1/automation/run-sse`;
    const controller = new AbortController();
    this.activeControllers.set(runId, controller);
    const abortFromCaller = () => controller.abort();
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    if (options.signal?.aborted) controller.abort();
    let timeoutPhase: 'connect' | 'execution' = 'connect';
    const timeoutTimer = setTimeout(() => controller.abort(), Math.min(STREAM_CONNECT_TIMEOUT_MS, timeoutMs));
    let executionTimer: ReturnType<typeof setTimeout> | undefined;
    let providerRunId = runId;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          url: options.url,
          goal: options.goal,
          output_schema: options.outputSchema,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutTimer);
      if (!response.ok) {
        let errMessage = `Upstream HTTP ${response.status} ${response.statusText}`;
        try {
          const errBody = await response.json();
          if (errBody.error?.message) errMessage = errBody.error.message;
        } catch {
          // ignore
        }

        onEvent({
          type: 'ERROR',
          runId,
          timestamp: new Date().toISOString(),
          errorCategory: response.status === 401 ? 'AUTH' : response.status === 402 ? 'BILLING' : response.status === 429 ? 'RATE_LIMIT' : 'UPSTREAM_5XX',
          errorMessage: this.sanitizeText(errMessage),
          isMock: false,
        });
        options.signal?.removeEventListener('abort', abortFromCaller);
        this.activeControllers.delete(runId);
        return;
      }

      timeoutPhase = 'execution';
      executionTimer = setTimeout(() => controller.abort(), timeoutMs);

      // Check if response body is readable stream
      if (!response.body) {
        onEvent({
          type: 'POLLING_FALLBACK',
          runId,
          timestamp: new Date().toISOString(),
          message: 'Server environment did not receive readable stream body. Switching to honest polling fallback.',
          isMock: false,
        });
        await this.fallbackPollingLoop(runId, startTime, timeoutMs, onEvent, controller.signal);
        this.activeControllers.delete(runId);
        return;
      }

      // Parse SSE lines
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let terminalSeen = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete trailing line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const jsonStr = trimmed.replace(/^data:\s*/, '').trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const rawEvent = JSON.parse(jsonStr);
            const actualRunId = rawEvent.run_id || runId;
            providerRunId = actualRunId;
            if (actualRunId !== runId) this.activeControllers.set(actualRunId, controller);

            if (rawEvent.type === 'STARTED') {
              onEvent({
                type: 'STARTED',
                runId: actualRunId,
                timestamp: new Date().toISOString(),
                isMock: false,
              });
            } else if (rawEvent.type === 'STREAMING_URL') {
              const url = rawEvent.streaming_url;
              const isValid = this.isValidTinyFishStreamingUrl(url);
              onEvent({
                type: 'STREAMING_URL',
                runId: actualRunId,
                timestamp: new Date().toISOString(),
                streamingUrl: isValid ? url : null,
                isMock: false,
              });
            } else if (rawEvent.type === 'PROGRESS') {
              onEvent({
                type: 'PROGRESS',
                runId: actualRunId,
                timestamp: new Date().toISOString(),
                purpose: this.sanitizeText(rawEvent.purpose || rawEvent.message),
                message: this.sanitizeText(rawEvent.message || rawEvent.purpose),
                elapsedMs: Date.now() - startTime,
                isMock: false,
              });
            } else if (rawEvent.type === 'COMPLETE') {
              terminalSeen = true;
              const terminalStatus = rawEvent.status === 'CANCELLED' || rawEvent.status === 'CANCELED'
                ? 'CANCELED'
                : rawEvent.status === 'FAILED'
                ? 'FAILED'
                : 'COMPLETED';
              onEvent({
                type: terminalStatus === 'CANCELED' ? 'CANCELED' : terminalStatus === 'FAILED' ? 'ERROR' : 'COMPLETE',
                runId: actualRunId,
                timestamp: new Date().toISOString(),
                status: terminalStatus === 'CANCELED' ? 'CANCELED' : terminalStatus,
                result: rawEvent.result || null,
                errorCategory: terminalStatus === 'FAILED' ? 'UPSTREAM_5XX' : undefined,
                errorMessage: terminalStatus === 'FAILED'
                  ? this.sanitizeText(rawEvent.error?.message || 'TinyFish automation run failed.')
                  : undefined,
                elapsedMs: Date.now() - startTime,
                isMock: false,
              });
              clearTimeout(executionTimer);
              options.signal?.removeEventListener('abort', abortFromCaller);
              this.activeControllers.delete(runId);
              this.activeControllers.delete(actualRunId);
              return;
            }
          } catch {
            // Ignore malformed individual SSE line
          }
        }
      }

      if (buffer.trim().startsWith('data:')) {
        const finalData = buffer.trim().replace(/^data:\s*/, '').trim();
        if (finalData) {
          try {
            const rawEvent = JSON.parse(finalData);
            if (rawEvent.type === 'COMPLETE') {
              terminalSeen = true;
              onEvent({
                type: rawEvent.status === 'CANCELLED' ? 'CANCELED' : rawEvent.status === 'FAILED' ? 'ERROR' : 'COMPLETE',
                runId: rawEvent.run_id || runId,
                timestamp: new Date().toISOString(),
                status: rawEvent.status === 'CANCELLED' ? 'CANCELED' : rawEvent.status || 'COMPLETED',
                result: rawEvent.result || null,
                errorCategory: rawEvent.status === 'FAILED' ? 'UPSTREAM_5XX' : undefined,
                errorMessage: rawEvent.status === 'FAILED' ? this.sanitizeText(rawEvent.error?.message || 'TinyFish automation run failed.') : undefined,
                elapsedMs: Date.now() - startTime,
                isMock: false,
              });
            }
          } catch {
            onEvent({
              type: 'ERROR',
              runId,
              timestamp: new Date().toISOString(),
              errorCategory: 'INVALID_INPUT',
              errorMessage: 'TinyFish stream ended with a malformed terminal event.',
              isMock: false,
            });
          }
        }
      }
      clearTimeout(executionTimer);
      options.signal?.removeEventListener('abort', abortFromCaller);
      if (!options.signal?.aborted && !terminalSeen) {
        onEvent({
          type: 'ERROR',
          runId: providerRunId,
          timestamp: new Date().toISOString(),
          errorCategory: 'NETWORK',
          errorMessage: 'TinyFish stream ended before a terminal completion event.',
          isMock: false,
        });
      }
      this.activeControllers.delete(runId);
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      if (executionTimer) clearTimeout(executionTimer);
      options.signal?.removeEventListener('abort', abortFromCaller);
      this.activeControllers.delete(runId);

      const isAborted = err.name === 'AbortError' || err.message?.includes('aborted');
      if (isAborted) {
        if (providerRunId !== runId) {
          await this.cancelRun(providerRunId, false);
        }
        onEvent({
          type: options.signal?.aborted ? 'CANCELED' : 'ERROR',
          runId,
          timestamp: new Date().toISOString(),
          errorCategory: options.signal?.aborted ? undefined : 'TIMEOUT',
          errorMessage: options.signal?.aborted
            ? 'Stream cancelled by the client.'
            : timeoutPhase === 'connect'
            ? `TinyFish SSE connection timed out before response headers after ${Math.min(STREAM_CONNECT_TIMEOUT_MS, timeoutMs)}ms.`
            : `TinyFish agent execution timed out after ${timeoutMs}ms; partial progress is unverified.`,
          status: options.signal?.aborted ? 'CANCELED' : undefined,
          isMock: false,
        });
      } else {
        // Stream dropped unexpectedly -> switch to honest polling fallback
        onEvent({
          type: 'POLLING_FALLBACK',
          runId,
          timestamp: new Date().toISOString(),
          message: `Stream disconnected: ${this.sanitizeText(err.message)}. Initiating honest polling fallback.`,
          isMock: false,
        });
        await this.fallbackPollingLoop(providerRunId, startTime, timeoutMs, onEvent, controller.signal);
      }
    } finally {
      clearTimeout(timeoutTimer);
      if (executionTimer) clearTimeout(executionTimer);
      options.signal?.removeEventListener('abort', abortFromCaller);
      for (const [activeRunId, activeController] of this.activeControllers) {
        if (activeController === controller) this.activeControllers.delete(activeRunId);
      }
    }
  }

  /**
   * Honest polling loop fallback when streaming is disconnected or unsupported.
   */
  private async fallbackPollingLoop(
    runId: string,
    startTime: number,
    timeoutMs: number,
    onEvent: (event: SanitizedStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const maxPolls = 10;
    const pollIntervalMs = 1500;

    for (let i = 0; i < maxPolls; i++) {
      if (signal?.aborted) {
        onEvent({
          type: 'CANCELED',
          runId,
          timestamp: new Date().toISOString(),
          status: 'CANCELED',
          message: 'Automation cancelled by client.',
          isMock: false,
        });
        return;
      }
      if (Date.now() - startTime >= timeoutMs) {
        onEvent({
          type: 'ERROR',
          runId,
          timestamp: new Date().toISOString(),
          errorCategory: 'TIMEOUT',
          errorMessage: 'Polling fallback reached execution deadline.',
          isMock: false,
        });
        return;
      }

      const continued = await this.waitForDelay(pollIntervalMs, signal);
      if (!continued) {
        onEvent({
          type: 'CANCELED',
          runId,
          timestamp: new Date().toISOString(),
          status: 'CANCELED',
          message: 'Automation cancelled by client.',
          isMock: false,
        });
        return;
      }
      const pollEvent = await this.pollRunStatus(runId, false, signal);
      onEvent(pollEvent);

      if (pollEvent.type === 'COMPLETE' || pollEvent.type === 'ERROR' || pollEvent.type === 'CANCELED') {
        return;
      }
      if (signal?.aborted) {
        onEvent({
          type: 'CANCELED',
          runId,
          timestamp: new Date().toISOString(),
          status: 'CANCELED',
          message: 'Automation cancelled by client.',
          isMock: false,
        });
        return;
      }
    }
  }

  /**
   * Deterministic mock streaming simulator for unit testing and offline preview.
   * Never fakes false browsing; strictly mirrors real TinyFish SSE event lifecycle.
   */
  private async runMockStreamingScenario(
    runId: string,
    options: StreamAutomationOptions,
    startTime: number,
    onEvent: (event: SanitizedStreamEvent) => void
  ): Promise<void> {
    const scenario = options.mockScenario || 'STANDARD';
    const emitCancelled = () => onEvent({
      type: 'CANCELED',
      runId,
      timestamp: new Date().toISOString(),
      status: 'CANCELED',
      message: 'Task cancelled by user signal.',
      isMock: true,
    });
    const pause = async (ms: number) => {
      const continued = await this.waitForDelay(ms, options.signal);
      if (!continued) emitCancelled();
      return continued;
    };

    // 1. STARTED
    onEvent({
      type: 'STARTED',
      runId,
      timestamp: new Date().toISOString(),
      isMock: true,
    });

    if (scenario === 'DISCONNECTED_STREAM') {
      // Stream abruptly disconnects after start
      onEvent({
        type: 'ERROR',
        runId,
        timestamp: new Date().toISOString(),
        errorCategory: 'NETWORK',
        errorMessage: 'Stream connection terminated abruptly by remote host.',
        isMock: true,
      });
      return;
    }

    if (!(await pause(60))) return;

    // 2. STREAMING_URL
    if (scenario === 'MISSING_STREAMING_URL') {
      onEvent({
        type: 'STREAMING_URL',
        runId,
        timestamp: new Date().toISOString(),
        streamingUrl: null, // Upstream returned null streaming URL
        isMock: true,
      });
    } else {
      const validUrl = `https://tf-${runId}.fra0-tinyfish.unikraft.app/stream/0`;
      onEvent({
        type: 'STREAMING_URL',
        runId,
        timestamp: new Date().toISOString(),
        streamingUrl: validUrl,
        isMock: true,
      });
      this.activeRunMetadata.set(runId, { status: 'RUNNING', streamingUrl: validUrl });
    }

    if (scenario === 'PARTIAL_PROGRESS') {
      // Emits only 1 step then ends without completion
      onEvent({
        type: 'PROGRESS',
        runId,
        timestamp: new Date().toISOString(),
        purpose: 'Navigating to public procurement registry...',
        message: 'Loaded search index; waiting for table selector.',
        elapsedMs: Date.now() - startTime,
        isMock: true,
      });
      return;
    }

    if (!(await pause(60))) return;

    // 3. PROGRESS UPDATES
    onEvent({
      type: 'PROGRESS',
      runId,
      timestamp: new Date().toISOString(),
      purpose: 'Navigating to public regulatory portal...',
      message: 'Checking indexed debarment and court notice tables.',
      elapsedMs: Date.now() - startTime,
      isMock: true,
    });

    if (scenario === 'CANCELLATION') {
      // Simulates user cancellation during progress
      onEvent({
        type: 'CANCELED',
        runId,
        timestamp: new Date().toISOString(),
        message: 'Task cancelled by user signal.',
        status: 'CANCELED',
        isMock: true,
      });
      return;
    }

    if (scenario === 'RECONNECT_POLLING_FALLBACK') {
      // Drops to polling fallback
      onEvent({
        type: 'POLLING_FALLBACK',
        runId,
        timestamp: new Date().toISOString(),
        message: 'SSE stream disconnected; actively falling back to honest polling.',
        isMock: true,
      });
      if (!(await pause(80))) return;
      onEvent({
        type: 'COMPLETE',
        runId,
        timestamp: new Date().toISOString(),
        status: 'COMPLETED',
        result: {
          title: 'Regulatory Registry',
          records_evaluated: 1,
          is_clean: true,
        },
        elapsedMs: Date.now() - startTime,
        isMock: true,
      });
      return;
    }

    if (!(await pause(60))) return;

    // 4. COMPLETE
    if (scenario === 'COMPLETION_WITHOUT_RESULT') {
      // Completed status reported, but result was null
      onEvent({
        type: 'COMPLETE',
        runId,
        timestamp: new Date().toISOString(),
        status: 'COMPLETED',
        result: null,
        elapsedMs: Date.now() - startTime,
        isMock: true,
      });
      return;
    }

    // Default SUCCESS scenario
    const mockResult = {
      title: 'Debarment & Sanctions Public Directory',
      records_checked: 3,
      matches_found: 0,
    };

    const currentMeta = this.activeRunMetadata.get(runId);
    this.activeRunMetadata.set(runId, {
      status: 'COMPLETED',
      streamingUrl: currentMeta?.streamingUrl || null,
      result: mockResult,
    });

    onEvent({
      type: 'COMPLETE',
      runId,
      timestamp: new Date().toISOString(),
      status: 'COMPLETED',
      result: mockResult,
      elapsedMs: Date.now() - startTime,
      isMock: true,
    });
  }

  private waitForDelay(ms: number, signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) return Promise.resolve(false);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve(true);
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        resolve(false);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}

export const tinyfishStreamingClient = new TinyFishStreamingClient();
