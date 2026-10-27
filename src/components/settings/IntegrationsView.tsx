import React, { useState, useEffect } from 'react';
import { Card } from '../common/Card.js';
import { Badge, BadgeTone } from '../common/Badge.js';
import { Button } from '../common/Button.js';
import {
  ShieldCheck,
  Key,
  Lock,
  ExternalLink,
  Play,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Activity,
  Layers,
  HelpCircle,
  Globe,
  Terminal,
} from 'lucide-react';
import { IntegrationHealth, ProviderAppStatus, ProviderErrorCategory } from '../../server/providers/types.js';
import { readSavedSettings, saveSettings, sanitizeSavedPublicUrl } from '../../persistence/settingsPersistence.js';
import type { SavedProviderProbe } from '../../persistence/settingsPersistence.js';

interface SetupInstruction {
  providerId: 'indiacos' | 'tinyfish';
  providerName: string;
  environmentKey: string;
  docsUrl: string;
  summary: string;
  steps: string[];
}

export const IntegrationsView: React.FC = () => {
  const [savedSettings] = useState(readSavedSettings);
  const [integrations, setIntegrations] = useState<Record<string, IntegrationHealth> | null>(null);
  const [instructions, setInstructions] = useState<Record<string, SetupInstruction> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [mockTestResults, setMockTestResults] = useState<Record<string, { success: boolean; message: string }>>(savedSettings.mockTestResults || {});
  const [testSuiteReport, setTestSuiteReport] = useState<any | null>(savedSettings.integrationTestSuiteReport || null);
  const [isRunningSuite, setIsRunningSuite] = useState(false);

  // TinyFish Baseline Test State
  const [tfUrl, setTfUrl] = useState(typeof savedSettings.tinyfishTestUrl === 'string' ? savedSettings.tinyfishTestUrl : 'https://mca.gov.in');
  const [tfMockScenario, setTfMockScenario] = useState<
    'SUCCESS' | 'NULL_RESULT' | 'INVALID_SCHEMA' | 'AUTH_ERROR' | 'INSUFFICIENT_CREDITS' | 'RATE_LIMITED' | 'TIMEOUT' | 'UPSTREAM_500'
  >(savedSettings.tinyfishMockScenario || 'SUCCESS');
  const [tfTestResult, setTfTestResult] = useState<any | null>(savedSettings.tinyfishTestResult || null);
  const [isTestingTfLive, setIsTestingTfLive] = useState(false);
  const [isTestingTfMock, setIsTestingTfMock] = useState(false);
  const [tfSuiteReport, setTfSuiteReport] = useState<any | null>(savedSettings.tinyfishSuiteReport || null);
  const [isRunningTfSuite, setIsRunningTfSuite] = useState(false);
  const [savedProviderProbes, setSavedProviderProbes] = useState<Record<string, SavedProviderProbe>>(savedSettings.providerProbes || {});

  useEffect(() => {
    saveSettings({
      mockTestResults,
      integrationTestSuiteReport: testSuiteReport,
      tinyfishTestUrl: sanitizeSavedPublicUrl(tfUrl),
      tinyfishMockScenario: tfMockScenario,
      tinyfishTestResult: tfTestResult,
      tinyfishSuiteReport: tfSuiteReport,
    });
  }, [mockTestResults, testSuiteReport, tfUrl, tfMockScenario, tfTestResult, tfSuiteReport]);

  const fetchIntegrations = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/health/integrations');
      if (res.ok) {
        const data = await res.json();
        setIntegrations(data.integrations || {});
        setInstructions(data.instructions || {});
        const observedProbes: Record<string, SavedProviderProbe> = {};
        for (const [providerId, health] of Object.entries(data.integrations || {}) as Array<[string, IntegrationHealth]>) {
          if (health.lastCheckedAt) {
            observedProbes[providerId] = {
              status: health.status,
              lastCheckedAt: health.lastCheckedAt,
              ...(typeof health.latencyMs === 'number' ? { latencyMs: health.latencyMs } : {}),
              errorCategory: health.errorCategory,
              upstreamRequestId: health.upstreamRequestId,
            };
          }
        }
        if (Object.keys(observedProbes).length > 0) {
          const mergedProbes = { ...(readSavedSettings().providerProbes || {}), ...observedProbes };
          setSavedProviderProbes(mergedProbes);
          saveSettings({ providerProbes: mergedProbes });
        }
      }
    } catch (err) {
      console.error('Error fetching integration health:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const handleTestConnection = async (providerId: 'indiacos' | 'tinyfish', useMock = false) => {
    setTestingProviderId(`${providerId}_${useMock ? 'mock' : 'live'}`);
    try {
      const res = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, useMock }),
      });
      const data = await res.json();
      if (useMock) {
        // Mock probes verify UI/demo handling only; they never overwrite live provider health.
        setMockTestResults((prev) => ({
          ...prev,
          [providerId]: { success: Boolean(data.success), message: String(data.message || 'Demo mock test finished.') },
        }));
      } else {
        await fetchIntegrations();
      }
    } catch (e: any) {
      alert(`Test failed: ${e.message}`);
    } finally {
      setTestingProviderId(null);
    }
  };

  const handleRunSuite = async () => {
    setIsRunningSuite(true);
    try {
      const res = await fetch('/api/integrations/verify-suite', { method: 'POST' });
      const data = await res.json();
      setTestSuiteReport(data);
    } catch (e: any) {
      alert(`Integration test suite failed: ${e.message}`);
    } finally {
      setIsRunningSuite(false);
    }
  };

  const handleRunTinyfishTest = async (useMock: boolean) => {
    if (useMock) {
      setIsTestingTfMock(true);
    } else {
      setIsTestingTfLive(true);
    }

    try {
      const res = await fetch('/api/integrations/tinyfish/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: tfUrl,
          goal: 'Extract page title and primary heading into structured JSON.',
          useMock,
          mockScenario: tfMockScenario,
        }),
      });
      const data = await res.json();
      setTfTestResult(data);
    } catch (e: any) {
      setTfTestResult({
        status: 'FAILED',
        result: null,
        elapsedMs: 0,
        diagnosticMessage: `Request error: ${e.message}`,
        isMock: useMock,
      });
    } finally {
      setIsTestingTfLive(false);
      setIsTestingTfMock(false);
    }
  };

  const handleRunTinyfishSuite = async () => {
    setIsRunningTfSuite(true);
    try {
      const res = await fetch('/api/integrations/tinyfish/verify-suite', { method: 'POST' });
      const data = await res.json();
      setTfSuiteReport(data);
    } catch (e: any) {
      alert(`TinyFish verification suite failed: ${e.message}`);
    } finally {
      setIsRunningTfSuite(false);
    }
  };

  const getStatusBadge = (status: ProviderAppStatus, isMock = false) => {
    if (isMock || status === 'DEMO_DATA') {
      return <Badge tone="subtle" size="sm">Demo data</Badge>;
    }

    switch (status) {
      case 'LIVE':
        return <Badge tone="verified" size="sm">Live (probe passed)</Badge>;
      case 'CONFIGURED':
        return <Badge tone="caution" size="sm">Configured · Untested</Badge>;
      case 'NOT_CONFIGURED':
        return <Badge tone="neutral" size="sm">Not configured</Badge>;
      case 'RATE_LIMITED':
        return <Badge tone="caution" size="sm">Rate limited (429)</Badge>;
      case 'BILLING_REQUIRED':
        return <Badge tone="caution" size="sm">Billing required (402)</Badge>;
      case 'AUTH_FAILED':
        return <Badge tone="risk" size="sm">Auth failed (401/403)</Badge>;
      case 'UPSTREAM_UNAVAILABLE':
      default:
        return <Badge tone="risk" size="sm">Upstream unavailable</Badge>;
    }
  };

  const renderProviderCard = (providerKey: 'indiacos' | 'tinyfish') => {
    const info = integrations?.[providerKey];
    const instr = instructions?.[providerKey];
    const isTestingLive = testingProviderId === `${providerKey}_live`;
    const isTestingMock = testingProviderId === `${providerKey}_mock`;

    const authHeaderNote =
      providerKey === 'indiacos'
        ? 'Authorization: Bearer <key> / X-API-Key: <key>'
        : 'X-API-Key: <key>';

    return (
      <Card
        key={providerKey}
        header={
          <div className="flex items-center gap-2">
            <span>{info?.providerName || providerKey}</span>
            {info && getStatusBadge(info.status, info.isMock)}
          </div>
        }
        headerAction={
          <a
            href={instr?.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-[#5F6572] hover:text-[#1C1F26] hover:underline"
          >
            <span>Official Docs</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        }
        className="space-y-4"
      >
        <div className="space-y-3 text-xs">
          {/* Key Status & Upstream Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-[#FAF8F5] border border-[#EAE6DF] rounded">
            <div>
              <span className="text-[10px] uppercase font-semibold text-[#8A91A0] block">
                Server Environment Key
              </span>
              <span className="font-mono text-xs font-semibold text-[#1C1F26]">
                {instr?.environmentKey}
              </span>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-[#5F6572]">
                <Key className="w-3 h-3 text-[#8A91A0]" />
                <span>{info?.maskedKeySnippet || 'Not configured'}</span>
              </div>
            </div>

            <div>
              <span className="text-[10px] uppercase font-semibold text-[#8A91A0] block">
                Auth Protocol
              </span>
              <span className="font-mono text-[11px] text-[#1C1F26]">
                {authHeaderNote}
              </span>
              <div className="mt-1 text-[10px] text-[#8A91A0]">
                Strict server-side isolation
              </div>
            </div>

            <div>
              <span className="text-[10px] uppercase font-semibold text-[#8A91A0] block">
                Latency / Request ID
              </span>
              <div className="flex items-center gap-1 font-mono text-[11px] text-[#1C1F26]">
                <Clock className="w-3 h-3 text-[#8A91A0]" />
                <span>{typeof info?.latencyMs === 'number' ? `${info.latencyMs}ms` : '—'}</span>
              </div>
              <div className="text-[10px] font-mono text-[#8A91A0] truncate">
                {info?.upstreamRequestId ? `req: ${info.upstreamRequestId}` : 'No recent probe'}
              </div>
            </div>
          </div>

          {/* Current Probe Narrative / Error Status */}
          {info?.message && (
            <div
              className={`p-2.5 rounded text-[11px] leading-relaxed flex items-start gap-2 ${
                info.status === 'LIVE'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : info.status === 'CONFIGURED'
                  ? 'bg-amber-50 text-amber-900 border border-amber-200'
                  : info.status === 'DEMO_DATA'
                  ? 'bg-slate-50 text-slate-800 border border-slate-200'
                  : info.status === 'NOT_CONFIGURED'
                  ? 'bg-[#FCFBF9] text-[#5F6572] border border-[#EAE6DF]'
                  : 'bg-amber-50 text-amber-900 border border-amber-200'
              }`}
            >
              {info.status === 'LIVE' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              ) : info.status === 'NOT_CONFIGURED' ? (
                <AlertCircle className="w-4 h-4 text-[#8A91A0] shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              )}
              <div>
                <span className="font-semibold block">Connection Status:</span>
                <span>{info.message}</span>
              </div>
            </div>
          )}

          {savedProviderProbes[providerKey] && (
            <div className="rounded border border-blue-200 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-950">
              <strong>Last recorded live verification:</strong>{' '}
              {new Date(savedProviderProbes[providerKey].lastCheckedAt).toLocaleString()} · {savedProviderProbes[providerKey].status}
              {typeof savedProviderProbes[providerKey].latencyMs === 'number' ? ` · ${savedProviderProbes[providerKey].latencyMs}ms` : ''}
              <span className="block text-[10px] text-blue-800">Saved verification history; current availability is shown above.</span>
            </div>
          )}

          {mockTestResults[providerKey] && (
            <div className={`p-2.5 rounded text-[11px] border ${mockTestResults[providerKey].success ? 'bg-slate-50 text-slate-800 border-slate-200' : 'bg-amber-50 text-amber-900 border-amber-200'}`}>
              <strong>Demo mock test (not live health):</strong> {mockTestResults[providerKey].message}
            </div>
          )}

          {/* Setup Instructions if missing */}
          {!info?.configured && instr && (
            <div className="p-3 bg-[#FCFBF9] border border-[#EAE6DF] rounded space-y-2">
              <div className="flex items-center gap-1.5 font-semibold text-[#1C1F26]">
                <Lock className="w-3.5 h-3.5 text-[#8A91A0]" />
                <span>How to Configure {instr.environmentKey}</span>
              </div>
              <p className="text-[11px] text-[#5F6572] leading-relaxed">
                {instr.summary}
              </p>
              <div className="p-2 bg-amber-50/70 border border-amber-200/80 rounded text-[11px] text-amber-900">
                <strong>Security:</strong> Configure keys in your server environment or deployment secrets manager, never in ordinary web text fields. Keys are strictly inaccessible from the browser.
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-[#5F6572] pl-1">
                {instr.steps.map((st, i) => (
                  <li key={i}>{st}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Action Row */}
          <div className="flex items-center justify-between pt-2 border-t border-[#EAE6DF]">
            <div className="text-[11px] text-[#8A91A0]">
              Bounded retries: Transient 5xx only · Never retries 401 or 402
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                isLoading={isTestingMock}
                disabled={isTestingLive}
                onClick={() => handleTestConnection(providerKey, true)}
              >
                Test with Demo Mock
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={isTestingLive}
                disabled={isTestingMock || !info?.configured}
                icon={<Activity className="w-3.5 h-3.5" />}
                onClick={() => handleTestConnection(providerKey, false)}
              >
                Test Live Connection
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2 border-b border-[#EAE6DF]">
        <div>
          <h2 className="text-base font-bold text-[#1C1F26]">
            Server-Only Integration Configuration Layer
          </h2>
          <p className="text-xs text-[#5F6572] mt-0.5">
            Manages secure upstream communication with IndiaCos (MCA21/GSTN) and TinyFish (Adverse Web Media). Verification results and test preferences are saved in this browser workspace; API keys remain server-side.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          isLoading={isRunningSuite}
          icon={<Play className="w-3.5 h-3.5 text-[#1C1F26]" />}
          onClick={handleRunSuite}
        >
          Run Integration Test Suite (8 Paths)
        </Button>
      </div>

      {/* Security Invariant Notice */}
      <div className="p-3 bg-[#FCFBF9] border border-[#EAE6DF] rounded text-xs space-y-1.5">
        <div className="flex items-center gap-2 font-semibold text-[#1C1F26]">
          <ShieldCheck className="w-4 h-4 text-emerald-700" />
          <span>Server-Side Secret Isolation Guarantee</span>
        </div>
        <p className="text-[11px] text-[#5F6572] leading-relaxed">
          <code>TINYFISH_API_KEY</code> and <code>INDIACOS_API_KEY</code> are accessed exclusively in server-side provider modules. The application enforces sane timeouts (7s), bounded retries for transient 502/503/504 errors, zero retries for 401/402 errors, and strict secret redaction.
        </p>
      </div>

      {/* Integration Test Suite Result Banner */}
      {testSuiteReport && (
        <Card
          header="Automated Integration Layer Test Suite Report"
          headerAction={
            <Badge tone={testSuiteReport.success ? 'verified' : 'risk'}>
              {testSuiteReport.assertionsPassed} Assertions Passed ({testSuiteReport.assertionsFailed} Failed)
            </Badge>
          }
        >
          <div className="space-y-2 text-xs">
            <p className="text-[11px] text-[#5F6572]">
              Verified paths: Configured, Missing-Key, Auth Failure (401), Billing/Wallet (402), Rate Limit (429), Timeout, Transient 5xx Retry, and Secret Redaction.
            </p>
            <div className="max-h-48 overflow-y-auto space-y-1 font-mono text-[10px] text-[#5F6572] bg-[#FCFBF9] p-2.5 rounded border border-[#EAE6DF]">
              {testSuiteReport.details.map((d: string, i: number) => (
                <div key={i} className={d.includes('[FAIL]') ? 'text-red-700 font-bold' : ''}>
                  {d}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Provider Cards */}
      <div className="space-y-4">
        {renderProviderCard('indiacos')}
        {renderProviderCard('tinyfish')}
      </div>

      {/* TinyFish Web Agent Baseline Extraction Proof */}
      <Card
        header={
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#1C1F26]" />
            <span>TinyFish Web Agent Baseline Extraction Proof</span>
            <span className="font-mono text-[10px] bg-[#EAE6DF] px-1.5 py-0.5 rounded text-[#5F6572]">
              POST /api/integrations/tinyfish/test
            </span>
          </div>
        }
        headerAction={
          <Button
            variant="secondary"
            size="sm"
            isLoading={isRunningTfSuite}
            icon={<Play className="w-3.5 h-3.5 text-[#1C1F26]" />}
            onClick={handleRunTinyfishSuite}
          >
            Run TinyFish Suite (15 Assertions)
          </Button>
        }
        className="space-y-4"
      >
        <div className="space-y-3 text-xs">
          <p className="text-[11px] text-[#5F6572] leading-relaxed">
            Extracts web data using TinyFish&apos;s REST automation endpoint. Validates that the returned data is an object conforming to <code>output_schema</code> (must contain non-empty string <code>title</code>). Demonstrates strict anti-false-success checks: status <code>COMPLETED</code> without a conforming result is rejected as <code>INVALID_RESPONSE</code>.
          </p>

          {/* Test Parameters Bar */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-[#FAF8F5] border border-[#EAE6DF] rounded">
            <div>
              <label className="text-[10px] uppercase font-semibold text-[#8A91A0] block mb-1">
                Target Public Web URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={tfUrl}
                  onChange={(e) => setTfUrl(e.target.value)}
                  placeholder="https://mca.gov.in"
                  className="w-full text-xs font-mono bg-white border border-[#D5CEC2] rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1C1F26]"
                />
              </div>
              <span className="text-[10px] text-[#8A91A0] mt-1 block">
                Use an approved public regulatory source (for example, mca.gov.in). Arbitrary domains are blocked.
              </span>
            </div>

            <div>
              <label className="text-[10px] uppercase font-semibold text-[#8A91A0] block mb-1">
                Offline Mock Scenario (For Testing Edge Cases)
              </label>
              <select
                value={tfMockScenario}
                onChange={(e) => setTfMockScenario(e.target.value as any)}
                className="w-full text-xs font-mono bg-white border border-[#D5CEC2] rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1C1F26]"
              >
                <option value="SUCCESS">Clean Success (Conforming Schema Extracted)</option>
                <option value="NULL_RESULT">Anti-False-Success: Completed with Null Result</option>
                <option value="INVALID_SCHEMA">Schema Rejected: Missing Required Title</option>
                <option value="AUTH_ERROR">HTTP 401 Auth Error (Invalid Key)</option>
                <option value="INSUFFICIENT_CREDITS">HTTP 402 / Billing (Wallet/Credits Exhausted)</option>
                <option value="RATE_LIMITED">HTTP 429 Rate Limit (Concurrency Limit)</option>
                <option value="TIMEOUT">Timeout Exceeded (&gt;10s window)</option>
                <option value="UPSTREAM_500">HTTP 500 Upstream Internal Error</option>
              </select>
              <span className="text-[10px] text-[#8A91A0] mt-1 block">
                Simulates specific provider conditions without network calls.
              </span>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-[#EAE6DF]">
            <div className="text-[11px] text-[#8A91A0]">
              Strict 10s timeout · X-API-Key auth · No keys in browser
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                isLoading={isTestingTfMock}
                disabled={isTestingTfLive}
                onClick={() => handleRunTinyfishTest(true)}
              >
                Run Offline Mock Test
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={isTestingTfLive}
                disabled={isTestingTfMock || !integrations?.tinyfish?.configured}
                icon={<Activity className="w-3.5 h-3.5" />}
                onClick={() => handleRunTinyfishTest(false)}
              >
                Run Live Web Agent Test
              </Button>
            </div>
          </div>

          {/* Test Execution Result */}
          {tfTestResult && (
            <div className="mt-3 p-3.5 bg-white border border-[#D5CEC2] rounded space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EAE6DF] pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#1C1F26]">Extraction Result:</span>
                  {tfTestResult.status === 'SUCCESS' && (
                    <Badge tone="verified">SUCCESS (Schema Validated)</Badge>
                  )}
                  {tfTestResult.status === 'INVALID_RESPONSE' && (
                    <Badge tone="caution">INVALID_RESPONSE (Schema Rejected)</Badge>
                  )}
                  {tfTestResult.status === 'NOT_CONFIGURED' && (
                    <Badge tone="neutral">NOT_CONFIGURED</Badge>
                  )}
                  {tfTestResult.status === 'AUTH_ERROR' && (
                    <Badge tone="risk">AUTH_ERROR (401)</Badge>
                  )}
                  {tfTestResult.status === 'INSUFFICIENT_CREDITS' && (
                    <Badge tone="caution">INSUFFICIENT_CREDITS (402)</Badge>
                  )}
                  {tfTestResult.status === 'RATE_LIMITED' && (
                    <Badge tone="caution">RATE_LIMITED (429)</Badge>
                  )}
                  {tfTestResult.status === 'TIMEOUT' && (
                    <Badge tone="caution">TIMEOUT</Badge>
                  )}
                  {tfTestResult.status === 'UPSTREAM_ERROR' && (
                    <Badge tone="risk">UPSTREAM_ERROR (5xx)</Badge>
                  )}
                  {tfTestResult.status === 'FAILED' && (
                    <Badge tone="risk">FAILED</Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[11px] font-mono text-[#5F6572]">
                  <span>{tfTestResult.isMock ? 'OFFLINE MOCK' : 'LIVE NETWORK'}</span>
                  <span>·</span>
                  <span>{tfTestResult.elapsedMs}ms</span>
                  {tfTestResult.upstreamRunId && (
                    <>
                      <span>·</span>
                      <span className="truncate max-w-[140px]">id: {tfTestResult.upstreamRunId}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Diagnostic Message */}
              <div className="text-[11px] text-[#5F6572] leading-relaxed bg-[#FAF8F5] p-2.5 rounded border border-[#EAE6DF]">
                <strong className="text-[#1C1F26] block mb-0.5">Diagnostic:</strong>
                {tfTestResult.diagnosticMessage}
              </div>

              {/* Structured Extracted Schema Fields */}
              {tfTestResult.result && (
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-[#1C1F26] block">
                    Conforming Schema Output:
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 bg-[#FCFBF9] border border-[#EAE6DF] rounded">
                      <span className="text-[10px] uppercase font-semibold text-[#8A91A0] block">
                        Page Title (Required)
                      </span>
                      <span className="font-semibold text-[#1C1F26] block mt-0.5">
                        {tfTestResult.result.title}
                      </span>
                    </div>

                    <div className="p-2 bg-[#FCFBF9] border border-[#EAE6DF] rounded">
                      <span className="text-[10px] uppercase font-semibold text-[#8A91A0] block">
                        Primary Heading
                      </span>
                      <span className="text-[#1C1F26] block mt-0.5">
                        {tfTestResult.result.heading || '—'}
                      </span>
                    </div>

                    {tfTestResult.result.summary && (
                      <div className="p-2 bg-[#FCFBF9] border border-[#EAE6DF] rounded md:col-span-2">
                        <span className="text-[10px] uppercase font-semibold text-[#8A91A0] block">
                          Summary
                        </span>
                        <span className="text-[#1C1F26] block mt-0.5">
                          {tfTestResult.result.summary}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-semibold text-[#8A91A0] block mb-1">
                      Raw Response JSON
                    </span>
                    <pre className="p-2 bg-[#1C1F26] text-[#FAF8F5] rounded text-[10px] font-mono overflow-x-auto">
                      {JSON.stringify(tfTestResult.result, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* TinyFish Automated Verification Suite Report */}
      {tfSuiteReport && (
        <Card
          header="TinyFish Web Agent Automated Verification Suite Report"
          headerAction={
            <Badge tone={tfSuiteReport.success ? 'verified' : 'risk'}>
              {tfSuiteReport.assertionsPassed} Assertions Passed ({tfSuiteReport.assertionsFailed} Failed)
            </Badge>
          }
        >
          <div className="space-y-2 text-xs">
            <p className="text-[11px] text-[#5F6572]">
              Verified invariants: Top-level object schema enforcement, non-empty title string rule, Anti-false-success on COMPLETED status with null result, HTTP 401 auth mapping, HTTP 402 billing mapping, HTTP 429 rate limit, 10s timeout, upstream 500 error, graceful unconfigured handling, and complete secret redaction.
            </p>
            <div className="max-h-48 overflow-y-auto space-y-1 font-mono text-[10px] text-[#5F6572] bg-[#FCFBF9] p-2.5 rounded border border-[#EAE6DF]">
              {tfSuiteReport.details.map((d: string, i: number) => (
                <div key={i} className={d.includes('[FAIL]') ? 'text-red-700 font-bold' : ''}>
                  {d}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
