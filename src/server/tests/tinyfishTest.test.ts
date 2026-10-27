/**
 * Automated Verification Unit Tests for TinyFish Web Agent Integration
 * Verifies:
 * 1. Strict server-side output_schema validation (object top-level, non-empty title string).
 * 2. Anti-false-success rule (COMPLETED with null result or missing fields yields INVALID_RESPONSE).
 * 3. Accurate provider error mapping (AUTH_ERROR, INSUFFICIENT_CREDITS, RATE_LIMITED, TIMEOUT, UPSTREAM_ERROR).
 * 4. Offline mock execution without network calls.
 * 5. NOT_CONFIGURED handling when live key is absent.
 * 6. Secret redaction on diagnostic outputs.
 */

import { tinyfishClient } from '../providers/tinyfishClient.js';
import { redactSecrets } from '../providers/httpClient.js';

export interface TinyFishTestReport {
  success: boolean;
  timestamp: string;
  assertionsPassed: number;
  assertionsFailed: number;
  details: string[];
  error?: string;
}

export async function runTinyFishIntegrationTests(): Promise<TinyFishTestReport> {
  const details: string[] = [];
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, desc: string) => {
    if (condition) {
      passed++;
      details.push(`[PASS] ${desc}`);
    } else {
      failed++;
      details.push(`[FAIL] ${desc}`);
      throw new Error(`Assertion failed: ${desc}`);
    }
  };

  try {
    details.push('Initiating TinyFish Web Agent Integration Unit Tests...');

    // ==========================================
    // 1. OUTPUT SCHEMA VALIDATION INVARIANTS
    // ==========================================
    // Must reject null / undefined / primitives / arrays
    const nullVal = tinyfishClient.validateBaselineResult(null);
    assert(!nullVal.valid, 'Schema validator rejects null payload');

    const arrVal = tinyfishClient.validateBaselineResult([{ title: 'test' }]);
    assert(!arrVal.valid, 'Schema validator rejects array payload (must be top-level object)');

    const strVal = tinyfishClient.validateBaselineResult('just a string');
    assert(!strVal.valid, 'Schema validator rejects primitive string payload');

    // Must reject missing or non-string required fields
    const emptyObj = tinyfishClient.validateBaselineResult({});
    assert(!emptyObj.valid, 'Schema validator rejects empty object missing required fields');

    const numTitle = tinyfishClient.validateBaselineResult({ title: 12345 });
    assert(!numTitle.valid, "Schema validator rejects non-string 'title'");

    const blankTitle = tinyfishClient.validateBaselineResult({ title: '   ' });
    assert(!blankTitle.valid, "Schema validator rejects whitespace-only 'title'");

    const missingHeading = tinyfishClient.validateBaselineResult({ title: 'Example Domain', summary: 'Example summary' });
    assert(!missingHeading.valid, "Schema validator rejects missing required 'heading'");

    const missingSummary = tinyfishClient.validateBaselineResult({ title: 'Example Domain', heading: 'Example heading' });
    assert(!missingSummary.valid, "Schema validator rejects missing required 'summary'");

    const invalidHeading = tinyfishClient.validateBaselineResult({
      title: 'Example Domain',
      heading: 123,
      summary: 'Example summary',
    });
    assert(!invalidHeading.valid, "Schema validator rejects non-string 'heading'");

    const invalidSummary = tinyfishClient.validateBaselineResult({
      title: 'Example Domain',
      heading: 'Example heading',
      summary: null,
    });
    assert(!invalidSummary.valid, "Schema validator rejects non-string 'summary'");

    const validFull = tinyfishClient.validateBaselineResult({
      title: 'Example Domain',
      heading: 'Example Domain',
      summary: 'Domain for documentation examples.',
    });
    assert(validFull.valid, 'Schema validator accepts complete baseline schema payload');

    // ==========================================
    // 2. PROVIDER SCHEMA AND LIVE RESULT CONTRACT (MOCKED HTTP)
    // ==========================================
    const previousFetch = globalThis.fetch;
    const previousApiKey = process.env.TINYFISH_API_KEY;
    const capturedRequest: { body?: { output_schema?: unknown; goal?: unknown } } = {};
    let responsePayload: unknown = {
      status: 'COMPLETED',
      result: {
        title: 'Example Domain',
        heading: 'Example Domain',
        summary: 'Domain for documentation examples.',
      },
    };
    let enqueueStatus = 200;
    let enqueuePayload: unknown = { run_id: 'test-run' };
    let malformedEnqueueResponse = false;
    let malformedPollResponse = false;
    let cancelRequests = 0;
    let enqueuePath = '';
    let pollResponses: unknown[] | null = null;
    let pollCount = 0;

    try {
      process.env.TINYFISH_API_KEY = 'vendortrace-test-only-key';
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        assert(headers.get('X-API-Key') === 'vendortrace-test-only-key', 'TinyFish API key is sent only in the server-side request header');
        const requestUrl = new URL(String(_input));
        if (requestUrl.pathname.endsWith('/run-async')) {
          enqueuePath = requestUrl.pathname;
          capturedRequest.body = JSON.parse(String(init?.body)) as { output_schema?: unknown; goal?: unknown };
          await new Promise((resolve) => setTimeout(resolve, 20));
          if (malformedEnqueueResponse) return new Response('not-json', { status: 200 });
          return new Response(JSON.stringify(enqueuePayload), {
            status: enqueueStatus,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (requestUrl.pathname.endsWith('/cancel')) {
          cancelRequests += 1;
          return new Response(JSON.stringify({ status: 'CANCELLED' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (requestUrl.pathname.endsWith('/test-run')) {
          pollCount += 1;
          if (malformedPollResponse) return new Response('not-json', { status: 200 });
          return new Response(JSON.stringify(pollResponses?.shift() ?? responsePayload), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`Unexpected TinyFish test URL: ${requestUrl.pathname}`);
      }) as typeof fetch;

      pollCount = 0;
      pollResponses = [
        { status: 'RUNNING' },
        {
          status: 'COMPLETED',
          result: {
            title: 'Example Domain',
            heading: 'Example Domain',
            summary: 'Domain for documentation examples.',
          },
        },
      ];
      const liveMockedSuccess = await tinyfishClient.runBaselineTest({ url: 'https://example.com' });
      assert(liveMockedSuccess.status === 'SUCCESS', 'Delayed conforming async run returns SUCCESS');
      assert(pollCount === 2, 'Async run keeps polling while the provider reports RUNNING before completion');
      pollResponses = null;
      assert(liveMockedSuccess.providerConnected === true, 'Successful run separately reports provider connection');
      assert(liveMockedSuccess.agentStatus === 'COMPLETED', 'Successful run reports terminal agent status');
      assert(liveMockedSuccess.upstreamRunId === 'test-run', 'Async run ID is retained for diagnostics');

      const schema = capturedRequest.body?.output_schema;
      const serializedSchema = JSON.stringify(schema);
      assert(
        typeof serializedSchema === 'string' && !serializedSchema.includes('"description"'),
        'Outgoing TinyFish output_schema contains no unsupported description annotations'
      );
      const schemaRecord = schema && typeof schema === 'object' && !Array.isArray(schema)
        ? schema as Record<string, unknown>
        : null;
      const properties = schemaRecord?.properties;
      const propertyRecord = properties && typeof properties === 'object' && !Array.isArray(properties)
        ? properties as Record<string, unknown>
        : null;
      const required = schemaRecord?.required;
      const requiredFields = ['title', 'heading', 'summary'];
      assert(
        schemaRecord?.type === 'object'
          && Array.isArray(required)
          && required.length === requiredFields.length
          && requiredFields.every((field) => required.includes(field))
          && propertyRecord !== null
          && requiredFields.every((field) => {
            const property = propertyRecord[field];
            return property !== null
              && typeof property === 'object'
              && !Array.isArray(property)
              && (property as Record<string, unknown>).type === 'string';
          }),
        'Outgoing TinyFish output_schema requires title, heading, and summary as strings'
      );
      const goal = capturedRequest.body?.goal;
      assert(
        typeof goal === 'string' && goal.includes('primary H1') && goal.includes('brief 1-2 sentence'),
        'Natural-language agent goal explains the heading and summary fields'
      );
      assert(
        enqueuePath === '/v1/automation/run-async',
        'Async run is submitted using the documented /run-async endpoint'
      );

      const invalidResults: unknown[] = [
        null,
        {},
        { heading: 'Example Domain', summary: 'Example summary' },
        { title: 'Example Domain', summary: 'Example summary' },
        { title: 'Example Domain', heading: 'Example Domain' },
        { title: 'Example Domain', heading: 123, summary: 'Example summary' },
        { title: 'Example Domain', heading: 'Example Domain', summary: false },
      ];
      for (const result of invalidResults) {
        responsePayload = { status: 'COMPLETED', result };
        const invalidResponse = await tinyfishClient.runBaselineTest({ url: 'https://example.com' });
        assert(
          invalidResponse.status === 'INVALID_RESPONSE',
          'Missing or malformed required result fields are never reported as successful'
        );
      }

      malformedPollResponse = true;
      const malformedResult = await tinyfishClient.runBaselineTest({ url: 'https://example.com' });
      assert(malformedResult.status === 'INVALID_RESPONSE', 'Malformed run-status JSON is rejected');
      malformedPollResponse = false;

      malformedEnqueueResponse = true;
      const malformedEnqueue = await tinyfishClient.runBaselineTest({ url: 'https://example.com' });
      assert(malformedEnqueue.status === 'INVALID_RESPONSE', 'Malformed run-async response is rejected');
      malformedEnqueueResponse = false;

      enqueueStatus = 200;
      enqueuePayload = { run_id: 'test-run' };
      responsePayload = { status: 'FAILED', error: { message: 'The browser agent failed.' } };
      const runFailure = await tinyfishClient.runBaselineTest({ url: 'https://example.com' });
      assert(runFailure.status === 'UPSTREAM_ERROR', 'Terminal provider run failure is reported as UPSTREAM_ERROR');
      assert(runFailure.agentStatus === 'FAILED', 'Terminal provider failure status is preserved');

      responsePayload = { status: 'CANCELLED' };
      const cancelledRun = await tinyfishClient.runBaselineTest({ url: 'https://example.com' });
      assert(cancelledRun.status === 'CANCELED', `Provider cancellation is distinct from timeout and failure (${cancelledRun.status}: ${cancelledRun.diagnosticMessage})`);

      responsePayload = { status: 'RUNNING' };
      const callerAbortController = new AbortController();
      const callerCancellationPromise = tinyfishClient.runBaselineTest({
        url: 'https://example.com',
        signal: callerAbortController.signal,
      });
      setTimeout(() => callerAbortController.abort(), 50);
      const callerCancelledRun = await callerCancellationPromise;
      assert(callerCancelledRun.status === 'CANCELED', 'Client cancellation remains distinct from timeout');

      const timeoutResult = await tinyfishClient.runBaselineTest({
        url: 'https://example.com',
        timeoutMs: 150,
      });
      assert(timeoutResult.status === 'TIMEOUT', 'A still-running agent is bounded by the configured deadline');
      assert(timeoutResult.agentStatus === 'RUNNING', `Timeout response distinguishes an agent still in progress (${timeoutResult.agentStatus})`);
      assert(cancelRequests > 0, 'Timed-out async run requests upstream cancellation');

      enqueueStatus = 500;
      enqueuePayload = { error: { message: 'Provider unavailable' } };
      const providerFailure = await tinyfishClient.runBaselineTest({ url: 'https://example.com' });
      assert(providerFailure.status === 'UPSTREAM_ERROR', 'Provider HTTP failure is reported as UPSTREAM_ERROR');
      assert(providerFailure.providerConnected === true, 'Provider HTTP response is distinct from extraction success');
      assert(!providerFailure.diagnosticMessage.includes('vendortrace-test-only-key'), 'Provider diagnostics never expose the API key');

      const mappedProviderErrors: Array<{ httpStatus: number; expected: string }> = [
        { httpStatus: 401, expected: 'AUTH_ERROR' },
        { httpStatus: 403, expected: 'AUTH_ERROR' },
        { httpStatus: 402, expected: 'INSUFFICIENT_CREDITS' },
        { httpStatus: 429, expected: 'RATE_LIMITED' },
      ];
      for (const providerError of mappedProviderErrors) {
        enqueueStatus = providerError.httpStatus;
        enqueuePayload = { error: { message: `HTTP ${providerError.httpStatus} test response` } };
        const mappedResponse = await tinyfishClient.runBaselineTest({ url: 'https://example.com' });
        assert(
          mappedResponse.status === providerError.expected,
          `TinyFish HTTP ${providerError.httpStatus} is mapped to ${providerError.expected}`
        );
      }
    } finally {
      globalThis.fetch = previousFetch;
      if (previousApiKey === undefined) {
        delete process.env.TINYFISH_API_KEY;
      } else {
        process.env.TINYFISH_API_KEY = previousApiKey;
      }
    }

    // ==========================================
    // 3. OFFLINE MOCK SUCCESS
    // ==========================================
    const mockSuccess = await tinyfishClient.runBaselineTest({
      useMock: true,
      mockScenario: 'SUCCESS',
    });
    assert(mockSuccess.status === 'SUCCESS', 'Mock baseline run returns status SUCCESS');
    assert(mockSuccess.isMock === true, 'Mock baseline run truthfully flags isMock = true');
    assert(mockSuccess.result !== null, 'Mock baseline run returns non-null result');
    assert(typeof mockSuccess.result?.title === 'string', 'Extracted result includes valid page title');
    assert(typeof mockSuccess.elapsedMs === 'number' && mockSuccess.elapsedMs > 0, 'Elapsed latency is measured');

    // ==========================================
    // 4. ANTI-FALSE-SUCCESS (COMPLETED but null result)
    // ==========================================
    const mockNull = await tinyfishClient.runBaselineTest({
      useMock: true,
      mockScenario: 'NULL_RESULT',
    });
    assert(
      mockNull.status === 'INVALID_RESPONSE',
      'COMPLETED status with null result mapped to INVALID_RESPONSE (not marked as SUCCESS)'
    );
    assert(mockNull.result === null, 'Result is null for NULL_RESULT scenario');

    // ==========================================
    // 5. INVALID SCHEMA RETURNED
    // ==========================================
    const mockInvalidSchema = await tinyfishClient.runBaselineTest({
      useMock: true,
      mockScenario: 'INVALID_SCHEMA',
    });
    assert(
      mockInvalidSchema.status === 'INVALID_RESPONSE',
      'Payload missing title mapped to INVALID_RESPONSE'
    );

    // ==========================================
    // 6. AUTH ERROR MAPPING (HTTP 401/403)
    // ==========================================
    const mockAuth = await tinyfishClient.runBaselineTest({
      useMock: true,
      mockScenario: 'AUTH_ERROR',
    });
    assert(mockAuth.status === 'AUTH_ERROR', 'Authentication error cleanly mapped to AUTH_ERROR');
    assert(mockAuth.diagnosticMessage.includes('401'), 'Diagnostic explains HTTP 401 status');

    // ==========================================
    // 7. INSUFFICIENT CREDITS / BILLING (HTTP 402)
    // ==========================================
    const mockCredits = await tinyfishClient.runBaselineTest({
      useMock: true,
      mockScenario: 'INSUFFICIENT_CREDITS',
    });
    assert(
      mockCredits.status === 'INSUFFICIENT_CREDITS',
      'Quota/credit exhaustion mapped to INSUFFICIENT_CREDITS (never generic transient failure)'
    );

    // ==========================================
    // 8. RATE LIMITING (HTTP 429)
    // ==========================================
    const mockRate = await tinyfishClient.runBaselineTest({
      useMock: true,
      mockScenario: 'RATE_LIMITED',
    });
    assert(mockRate.status === 'RATE_LIMITED', 'Rate limit condition mapped to RATE_LIMITED');

    // ==========================================
    // 9. TIMEOUT & UPSTREAM ERROR HANDLING
    // ==========================================
    const mockTimeout = await tinyfishClient.runBaselineTest({
      useMock: true,
      mockScenario: 'TIMEOUT',
      timeoutMs: 5000,
    });
    assert(mockTimeout.status === 'TIMEOUT', 'Exceeded timeout window mapped to TIMEOUT');

    const mock500 = await tinyfishClient.runBaselineTest({
      useMock: true,
      mockScenario: 'UPSTREAM_500',
    });
    assert(mock500.status === 'UPSTREAM_ERROR', 'Upstream 500 error mapped to UPSTREAM_ERROR');

    // ==========================================
    // 10. LIVE HANDLING WHEN KEY NOT CONFIGURED
    // ==========================================
    const configuredApiKey = process.env.TINYFISH_API_KEY;
    try {
      delete process.env.TINYFISH_API_KEY;
      const liveUnconfigured = await tinyfishClient.runBaselineTest({ useMock: false });
      assert(
        liveUnconfigured.status === 'NOT_CONFIGURED',
        'Live test without TINYFISH_API_KEY gracefully returns NOT_CONFIGURED without crash'
      );
      assert(
        liveUnconfigured.isMock === false,
        'Live unconfigured test truthfully marks isMock = false'
      );
    } finally {
      if (configuredApiKey === undefined) {
        delete process.env.TINYFISH_API_KEY;
      } else {
        process.env.TINYFISH_API_KEY = configuredApiKey;
      }
    }

    // ==========================================
    // 11. SECRET REDACTION INVARIANTS
    // ==========================================
    const sampleLeak = 'Error on key sk_live_tinyfish_998877665544332211 or Bearer token_secret_123';
    const redacted = redactSecrets(sampleLeak);
    assert(!redacted.includes('998877665544332211'), 'Secret key tokens are completely redacted');
    assert(!redacted.includes('token_secret_123'), 'Auth tokens are completely redacted');

    details.push(`All ${passed} assertions for TinyFish Integration completed successfully.`);
    return {
      success: true,
      timestamp: new Date().toISOString(),
      assertionsPassed: passed,
      assertionsFailed: failed,
      details,
    };
  } catch (err: any) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      assertionsPassed: passed,
      assertionsFailed: failed,
      details,
      error: err.message,
    };
  }
}
