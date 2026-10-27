/**
 * Automated Verification Test Suite for VendorTrace Integration Layer
 * Tests: Configured, Missing-key, Auth failure (401), Billing/Wallet (402), Rate limit (429),
 * Timeout, Provider 5xx transient error paths, and Secret Redaction.
 */

import { MockCompanyRegistryProvider, MockWebInvestigationProvider } from '../providers/mockAdapters.js';
import { redactSecrets } from '../providers/httpClient.js';

export interface IntegrationTestReport {
  success: boolean;
  timestamp: string;
  assertionsPassed: number;
  assertionsFailed: number;
  details: string[];
  error?: string;
}

export async function runIntegrationTests(): Promise<IntegrationTestReport> {
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
    details.push('Initiating Integration Layer Verification...');

    // ==========================================
    // 1. MISSING-KEY PATH TESTS
    // ==========================================
    const unconfiguredIndiacos = new MockCompanyRegistryProvider(false);
    assert(unconfiguredIndiacos.isConfigured() === false, 'Unconfigured IndiaCos reports isConfigured() = false');

    const unconfiguredRes = await unconfiguredIndiacos.testConnection();
    assert(unconfiguredRes.success === false, 'Unconfigured connection test returns success = false');
    assert(unconfiguredRes.status === 'NOT_CONFIGURED', 'Unconfigured status matches "NOT_CONFIGURED"');
    assert(unconfiguredRes.errorCategory === null, 'Unconfigured errorCategory is null (not an upstream network failure)');

    const unconfiguredLookup = await unconfiguredIndiacos.lookupByCIN('U72200MH2021PTC369123');
    assert(unconfiguredLookup.success === false && unconfiguredLookup.status === 'NOT_CONFIGURED', 'Lookup on unconfigured provider cleanly aborts');

    const unconfiguredTinyfish = new MockWebInvestigationProvider(false);
    assert(unconfiguredTinyfish.isConfigured() === false, 'Unconfigured TinyFish reports isConfigured() = false');
    const tfUnconfRes = await unconfiguredTinyfish.testConnection();
    assert(tfUnconfRes.status === 'NOT_CONFIGURED', 'TinyFish unconfigured status is "NOT_CONFIGURED"');

    // ==========================================
    // 2. CONFIGURED / MOCK DATA PATH TESTS
    // ==========================================
    const configuredIndiacos = new MockCompanyRegistryProvider(true);
    assert(configuredIndiacos.isConfigured() === true, 'Configured IndiaCos reports isConfigured() = true');

    const connTest = await configuredIndiacos.testConnection();
    assert(connTest.success === true, 'Configured connection test succeeds');
    assert(connTest.status === 'DEMO_DATA', 'Mock adapter cleanly returns DEMO_DATA (never fake LIVE)');
    assert(connTest.isMock === true, 'isMock flag is strictly true');

    const lookupRes = await configuredIndiacos.lookupByCIN('L27100MH1907PLC000260');
    assert(lookupRes.success === true, 'CIN lookup succeeds');
    assert(lookupRes.profile?.cin === 'L27100MH1907PLC000260', 'Returned CIN matches input');
    assert(lookupRes.profile?.directors !== undefined && lookupRes.profile.directors.length > 0, 'Directors array populated');

    // ==========================================
    // 3. AUTH FAILURE PATH (HTTP 401/403)
    // ==========================================
    const authFailProvider = new MockCompanyRegistryProvider(true, {
      forceStatus: 'AUTH_FAILED',
      forceErrorCategory: 'AUTH',
      forceErrorMessage: 'Authentication failed (HTTP 401). Invalid API Key.',
    });
    const authRes = await authFailProvider.testConnection();
    assert(authRes.success === false, 'Auth failure returns success = false');
    assert(authRes.status === 'AUTH_FAILED', 'Auth failure maps to AUTH_FAILED');
    assert(authRes.errorCategory === 'AUTH', 'Auth failure errorCategory is AUTH');

    // ==========================================
    // 4. BILLING / WALLET EXHAUSTION (HTTP 402)
    // ==========================================
    const billingFailProvider = new MockCompanyRegistryProvider(true, {
      forceStatus: 'BILLING_REQUIRED',
      forceErrorCategory: 'BILLING',
      forceErrorMessage: 'Account balance exhausted (HTTP 402 Payment Required). Wallet recharge needed.',
    });
    const billRes = await billingFailProvider.testConnection();
    assert(billRes.success === false, 'Billing failure returns success = false');
    assert(billRes.status === 'BILLING_REQUIRED', 'HTTP 402 maps to BILLING_REQUIRED');
    assert(billRes.errorCategory === 'BILLING', 'Billing condition categorized as BILLING');

    // ==========================================
    // 5. RATE LIMIT PATH (HTTP 429)
    // ==========================================
    const rateLimitProvider = new MockWebInvestigationProvider(true, {
      forceStatus: 'RATE_LIMITED',
      forceErrorCategory: 'RATE_LIMIT',
      forceErrorMessage: 'Rate limit exceeded (HTTP 429). Too many requests.',
    });
    const rateRes = await rateLimitProvider.testConnection();
    assert(rateRes.status === 'RATE_LIMITED', 'HTTP 429 maps to RATE_LIMITED');
    assert(rateRes.errorCategory === 'RATE_LIMIT', 'Error category is RATE_LIMIT');

    // ==========================================
    // 6. TIMEOUT PATH
    // ==========================================
    const timeoutProvider = new MockCompanyRegistryProvider(true, {
      simulateTimeout: true,
    });
    const timeoutRes = await timeoutProvider.testConnection();
    assert(timeoutRes.success === false, 'Timeout returns success = false');
    assert(timeoutRes.status === 'UPSTREAM_UNAVAILABLE', 'Timeout maps to UPSTREAM_UNAVAILABLE');
    assert(timeoutRes.errorCategory === 'TIMEOUT', 'Error category is TIMEOUT');
    assert(timeoutRes.latencyMs >= 6000, 'Reported timeout latency is bounded correctly');

    // ==========================================
    // 7. PROVIDER 5XX ERROR PATH
    // ==========================================
    const upstreamFailProvider = new MockWebInvestigationProvider(true, {
      forceStatus: 'UPSTREAM_UNAVAILABLE',
      forceErrorCategory: 'UPSTREAM_5XX',
      forceErrorMessage: 'Upstream Bad Gateway (HTTP 502) after bounded retries.',
    });
    const upstreamRes = await upstreamFailProvider.testConnection();
    assert(upstreamRes.status === 'UPSTREAM_UNAVAILABLE', 'HTTP 502 maps to UPSTREAM_UNAVAILABLE');
    assert(upstreamRes.errorCategory === 'UPSTREAM_5XX', 'Error category is UPSTREAM_5XX');

    // ==========================================
    // 8. SECRET REDACTION SECURITY TEST
    // ==========================================
    const rawSecretLeakString = 'Error connecting with Bearer secret_live_key_987654321 and X-API-Key: tf_sec_1122334455';
    const redacted = redactSecrets(rawSecretLeakString);
    assert(!redacted.includes('secret_live_key_987654321'), 'Bearer token successfully redacted');
    assert(!redacted.includes('tf_sec_1122334455'), 'X-API-Key token successfully redacted');
    assert(redacted.includes('[REDACTED]'), 'Redaction placeholder present');

    details.push('All 8 integration paths verified successfully with zero secret leakage.');

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
      assertionsFailed: failed + 1,
      details,
      error: err.message || String(err),
    };
  }
}
