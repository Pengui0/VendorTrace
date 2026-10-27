/**
 * TinyFish Streaming & Live Investigation Test Suite
 * Tests disconnected streams, missing streaming URL, partial progress,
 * completion without a result, cancellation, and reconnect/polling fallback.
 */

import {
  tinyfishStreamingClient,
  SanitizedStreamEvent,
} from '../providers/tinyfishStreamingClient.js';

export async function runTinyFishStreamingTests(): Promise<{
  success: boolean;
  assertionsPassed: number;
  assertionsFailed: number;
  logs: string[];
}> {
  const logs: string[] = [];
  let assertionsPassed = 0;
  let assertionsFailed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      assertionsPassed++;
      logs.push(`[PASS] ${desc}`);
    } else {
      assertionsFailed++;
      logs.push(`[FAIL] ${desc}`);
    }
  }

  logs.push('=== 1. TESTING URL VALIDATION FOR STREAMING PREVIEWS ===');
  assert(
    tinyfishStreamingClient.isValidTinyFishStreamingUrl('https://tf-run-123.fra0-tinyfish.unikraft.app/stream/0'),
    'Accepts valid TinyFish unikraft streaming preview URL'
  );
  assert(
    tinyfishStreamingClient.isValidTinyFishStreamingUrl('https://agent.tinyfish.ai/stream/abc'),
    'Accepts valid TinyFish agent streaming URL'
  );
  assert(
    !tinyfishStreamingClient.isValidTinyFishStreamingUrl('http://insecure-stream.com'),
    'Rejects non-HTTPS streaming URLs'
  );
  assert(
    !tinyfishStreamingClient.isValidTinyFishStreamingUrl('https://malicious-phishing.com/stream/0'),
    'Rejects unverified third-party domains (prevents guessed/fabricated preview URLs)'
  );
  assert(
    !tinyfishStreamingClient.isValidTinyFishStreamingUrl(null),
    'Handles null streaming URL cleanly'
  );

  logs.push('\n=== 2. TESTING DISCONNECTED STREAMS ===');
  const disconnectedEvents: SanitizedStreamEvent[] = [];
  await tinyfishStreamingClient.executeStreamingRun(
    {
      url: 'https://gem.gov.in',
      goal: 'Check debarred supplier list',
      useMock: true,
      mockScenario: 'DISCONNECTED_STREAM',
    },
    (ev) => disconnectedEvents.push(ev)
  );

  assert(disconnectedEvents.some((e) => e.type === 'STARTED'), 'Emits initial STARTED event before disconnection');
  const disconnectError = disconnectedEvents.find((e) => e.type === 'ERROR');
  assert(Boolean(disconnectError), 'Captures stream termination as sanitized ERROR event');
  assert(disconnectError?.errorCategory === 'NETWORK', 'Categorizes unexpected disconnection as NETWORK');

  logs.push('\n=== 3. TESTING MISSING STREAMING URL ===');
  const missingUrlEvents: SanitizedStreamEvent[] = [];
  await tinyfishStreamingClient.executeStreamingRun(
    {
      url: 'https://services.ecourts.gov.in',
      goal: 'Extract case docket table',
      useMock: true,
      mockScenario: 'MISSING_STREAMING_URL',
    },
    (ev) => missingUrlEvents.push(ev)
  );

  const streamUrlEvent = missingUrlEvents.find((e) => e.type === 'STREAMING_URL');
  assert(Boolean(streamUrlEvent), 'Receives STREAMING_URL event');
  assert(streamUrlEvent?.streamingUrl === null, 'Honestly reports streamingUrl as null when upstream does not supply preview');
  assert(missingUrlEvents.some((e) => e.type === 'COMPLETE'), 'Stream proceeds to completion even when preview URL is missing');

  logs.push('\n=== 4. TESTING PARTIAL PROGRESS ===');
  const partialEvents: SanitizedStreamEvent[] = [];
  await tinyfishStreamingClient.executeStreamingRun(
    {
      url: 'https://gem.gov.in',
      goal: 'Audit seller ratings',
      useMock: true,
      mockScenario: 'PARTIAL_PROGRESS',
    },
    (ev) => partialEvents.push(ev)
  );

  assert(partialEvents.some((e) => e.type === 'PROGRESS'), 'Captures intermediate PROGRESS step');
  assert(!partialEvents.some((e) => e.type === 'COMPLETE'), 'Does not manufacture fake COMPLETE event on partial progress');

  logs.push('\n=== 5. TESTING COMPLETION WITHOUT A RESULT ===');
  const noResultEvents: SanitizedStreamEvent[] = [];
  await tinyfishStreamingClient.executeStreamingRun(
    {
      url: 'https://example.com',
      goal: 'Extract product catalog',
      useMock: true,
      mockScenario: 'COMPLETION_WITHOUT_RESULT',
    },
    (ev) => noResultEvents.push(ev)
  );

  const noResultComplete = noResultEvents.find((e) => e.type === 'COMPLETE');
  assert(Boolean(noResultComplete), 'Receives COMPLETE event');
  assert(noResultComplete?.result === null, 'Preserves null result (does not invent placeholder data)');

  logs.push('\n=== 6. TESTING CANCELLATION SUPPORT ===');
  const cancelEvents: SanitizedStreamEvent[] = [];
  await tinyfishStreamingClient.executeStreamingRun(
    {
      url: 'https://gem.gov.in',
      goal: 'Audit large tender archive',
      useMock: true,
      mockScenario: 'CANCELLATION',
    },
    (ev) => cancelEvents.push(ev)
  );

  const cancelEvent = cancelEvents.find((e) => e.type === 'CANCELED');
  assert(Boolean(cancelEvent), 'Correctly handles and emits CANCELED event');
  assert(cancelEvent?.status === 'CANCELED', 'Records run status as CANCELED');

  const externalCancelController = new AbortController();
  const externallyCancelledEvents: SanitizedStreamEvent[] = [];
  const externalCancelTimer = setTimeout(() => externalCancelController.abort(), 10);
  await tinyfishStreamingClient.executeStreamingRun(
    {
      url: 'https://gem.gov.in',
      goal: 'Cancel a running deterministic stream',
      useMock: true,
      signal: externalCancelController.signal,
    },
    (ev) => externallyCancelledEvents.push(ev)
  );
  clearTimeout(externalCancelTimer);
  assert(externallyCancelledEvents.some((event) => event.type === 'CANCELED'), 'External abort signal cancels a synthetic stream promptly');
  assert(!externallyCancelledEvents.some((event) => event.type === 'COMPLETE'), 'Cancelled stream cannot emit a late completion event');

  // Test cancelRun API method directly
  const cancelResult = await tinyfishStreamingClient.cancelRun('tf_test_cancel_99');
  assert(cancelResult.success, 'cancelRun method executes cleanly');

  logs.push('\n=== 7. TESTING RECONNECT & POLLING FALLBACK ===');
  const fallbackEvents: SanitizedStreamEvent[] = [];
  await tinyfishStreamingClient.executeStreamingRun(
    {
      url: 'https://cvc.gov.in',
      goal: 'Check public debarment gazette',
      useMock: true,
      mockScenario: 'RECONNECT_POLLING_FALLBACK',
    },
    (ev) => fallbackEvents.push(ev)
  );

  assert(
    fallbackEvents.some((e) => e.type === 'POLLING_FALLBACK'),
    'Emits POLLING_FALLBACK notice when stream drops'
  );
  assert(
    fallbackEvents.some((e) => e.type === 'COMPLETE'),
    'Successfully resolves task to COMPLETE via polling fallback'
  );

  // Direct pollRunStatus check
  const polled = await tinyfishStreamingClient.pollRunStatus('tf_poll_test', true);
  assert(polled.type === 'PROGRESS', 'Honest polling reports real RUNNING status while in flight');

  logs.push('\n=== 8. TESTING LIVE SSE LIFECYCLE AND DEADLINES ===');
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.TINYFISH_API_KEY;
  process.env.TINYFISH_API_KEY = 'stream-test-key';
  const responseFor = (stream: ReadableStream<Uint8Array>) => new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
  const encoder = new TextEncoder();
  try {
    const delayedEvents: SanitizedStreamEvent[] = [];
    globalThis.fetch = async () => responseFor(new ReadableStream<Uint8Array>({
      async start(controller) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        controller.enqueue(encoder.encode('data: {"type":"HEARTBEAT"}\n\n'));
        controller.enqueue(encoder.encode('data: {"type":"PROGRESS","run_id":"delayed-run","purpose":"Searching records"}\n\n'));
        await new Promise((resolve) => setTimeout(resolve, 30));
        controller.enqueue(encoder.encode('data: {"type":"COMPLETE","run_id":"delayed-run","status":"COMPLETED","result":{"records":[]}}\n\n'));
        controller.close();
      },
    }));
    await tinyfishStreamingClient.executeStreamingRun({ url: 'https://gem.gov.in', goal: 'Search', timeoutMs: 500 }, (event) => delayedEvents.push(event));
    assert(delayedEvents.some((event) => event.type === 'PROGRESS'), 'Delayed progress and keep-alive do not trigger a connection timeout');
    assert(delayedEvents.some((event) => event.type === 'COMPLETE' && event.status === 'COMPLETED'), 'Stops on documented successful COMPLETE terminal event');

    globalThis.fetch = async () => responseFor(new ReadableStream<Uint8Array>({
      start(controller) { controller.error(new Error('socket disconnected')); },
    }));
    const disconnectEvents: SanitizedStreamEvent[] = [];
    await tinyfishStreamingClient.executeStreamingRun({ url: 'https://gem.gov.in', goal: 'Search', timeoutMs: 5 }, (event) => disconnectEvents.push(event));
    assert(disconnectEvents.some((event) => event.type === 'POLLING_FALLBACK'), 'Unexpected SSE disconnect enters bounded status fallback');

    globalThis.fetch = async (_input, init) => responseFor(new ReadableStream<Uint8Array>({
      start(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
      },
    }));
    const timeoutEvents: SanitizedStreamEvent[] = [];
    await tinyfishStreamingClient.executeStreamingRun({ url: 'https://gem.gov.in', goal: 'Search', timeoutMs: 30 }, (event) => timeoutEvents.push(event));
    const timeoutEvent = timeoutEvents.find((event) => event.type === 'ERROR' && event.errorCategory === 'TIMEOUT');
    assert(Boolean(timeoutEvent?.errorMessage?.includes('agent execution timed out')), 'Silent SSE after connection is classified as agent execution timeout');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.TINYFISH_API_KEY;
    else process.env.TINYFISH_API_KEY = originalApiKey;
  }

  return {
    success: assertionsFailed === 0,
    assertionsPassed,
    assertionsFailed,
    logs,
  };
}
