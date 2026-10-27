import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Play,
  Square,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Building2,
  Scale,
  ShieldAlert,
  Newspaper,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  Radio,
} from 'lucide-react';
import { SanitizedStreamEvent } from '../../server/providers/tinyfishStreamingClient.js';

interface Workstream {
  id: string;
  name: string;
  provider: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'unavailable' | 'blocked' | 'cancelled' | 'timed_out' | 'partial';
  elapsedMs: number;
  message: string;
}

interface LiveStreamingWorkbenchProps {
  targetName: string;
  identifiers?: string[];
  isInvestigating: boolean;
  isDemoMode: boolean;
  onRunStream?: () => void;
  onCancelStream?: () => void;
}

const liveRunStorageKey = (scope: string) => `vendortrace.live-workbench.v1:${encodeURIComponent(scope)}`;
const readSavedLiveRun = (scope: string) => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(liveRunStorageKey(scope));
    if (!raw) return null;
    const saved = JSON.parse(raw);
    return saved?.version === 1 && saved.scope === scope && saved.lastCompletedRun?.result
      ? saved
      : null;
  } catch {
    return null;
  }
};

export const LiveStreamingWorkbench: React.FC<LiveStreamingWorkbenchProps> = ({
  targetName,
  identifiers = [],
  isInvestigating,
  isDemoMode,
}) => {
  const identifierKey = identifiers.map((value) => value.trim().toUpperCase()).filter(Boolean).sort().join('|');
  const scopeKey = JSON.stringify({ targetName: targetName.trim().toUpperCase(), identifierKey, isDemoMode });
  const [isRunning, setIsRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [streamingUrl, setStreamingUrl] = useState<string | null>(null);
  const [streamEvents, setStreamEvents] = useState<SanitizedStreamEvent[]>([]);
  const [lastCompletedRun, setLastCompletedRun] = useState<{
    runId: string;
    completedAt: string;
    streamingUrl: string | null;
    result: any;
    elapsedMs: number;
  } | null>(null);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [runStatus, setRunStatus] = useState<'IDLE' | 'RUNNING' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED' | 'TIMED_OUT' | 'AUTH_ERROR' | 'RATE_LIMITED' | 'UPSTREAM_FAILURE' | 'FAILED'>('IDLE');
  const [attemptCount, setAttemptCount] = useState(0);
  const [agentTimeoutMs, setAgentTimeoutMs] = useState(120000);
  const [hydratedScopeKey, setHydratedScopeKey] = useState<string | null>(null);

  // 4 Verified Actual Workstreams
  const [workstreams, setWorkstreams] = useState<Workstream[]>([
    {
      id: 'mca_gst',
      name: 'MCA21 & GSTN Registry Verification',
      provider: 'IndiaCos Live Gateway',
      icon: Building2,
      status: 'queued',
      elapsedMs: 0,
      message: 'Standby for corporate identification query',
    },
    {
      id: 'litigation',
      name: 'E-Courts & Commercial Tribunals',
      provider: 'National Dockets & IndiaCos Case API',
      icon: Scale,
      status: 'queued',
      elapsedMs: 0,
      message: 'Standby for insolvency & winding-up docket lookup',
    },
    {
      id: 'debarment',
      name: 'GeM & CVC Debarment Verification',
      provider: 'TinyFish Search + Fetch (Official Sources First)',
      icon: ShieldAlert,
      status: 'queued',
      elapsedMs: 0,
      message: 'Standby for procurement sanction registers',
    },
    {
      id: 'adverse_media',
      name: 'Negative News & Adverse Media',
      provider: 'TinyFish Media Search (Bounded Time Window)',
      icon: Newspaper,
      status: 'queued',
      elapsedMs: 0,
      message: 'Standby for syndicated wire deduplication',
    },
  ]);

  const timerRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const runSequenceRef = useRef(0);
  const cancelledRef = useRef(false);
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  useEffect(() => {
    runSequenceRef.current += 1;
    cancelledRef.current = true;
    abortControllerRef.current?.abort();
    if (streamReaderRef.current) void streamReaderRef.current.cancel().catch(() => undefined);
    setIsRunning(false);
    setActiveRunId(null);
    setStreamingUrl(null);
    const saved = readSavedLiveRun(scopeKey);
    setStreamEvents(Array.isArray(saved?.streamEvents) ? saved.streamEvents : []);
    setLastCompletedRun(saved?.lastCompletedRun || null);
    setActiveError(null);
    setRunStatus(saved?.runStatus || 'IDLE');
    setAttemptCount(Number(saved?.attemptCount) || 0);
    setElapsedTime(0);
    setWorkstreams((prev) => {
      const savedStatuses = saved?.workstreams;
      return prev.map((workstream) => savedStatuses?.[workstream.id] ? {
        ...workstream,
        ...savedStatuses[workstream.id],
      } : ({
      ...workstream,
      status: 'queued',
      elapsedMs: 0,
      message: 'Standby for source-backed verification',
      }));
    });
    setHydratedScopeKey(scopeKey);
  }, [scopeKey]);

  useEffect(() => {
    if (!lastCompletedRun || hydratedScopeKey !== scopeKey || typeof window === 'undefined') return;
    try {
      const savedStatuses = Object.fromEntries(workstreams.map(({ id, status, elapsedMs, message }) => [id, { status, elapsedMs, message }]));
      window.localStorage.setItem(liveRunStorageKey(scopeKey), JSON.stringify({
        version: 1,
        scope: scopeKey,
        lastCompletedRun,
        streamEvents,
        workstreams: savedStatuses,
        runStatus,
        attemptCount,
      }));
    } catch {
      // Browser storage can be disabled or full; keep the live run usable for this session.
    }
  }, [lastCompletedRun, streamEvents, workstreams, runStatus, attemptCount, hydratedScopeKey, scopeKey]);

  // Timer for elapsed seconds
  useEffect(() => {
    if (isRunning) {
      const start = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - start) / 100));
      }, 100);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRunning]);

  // Validates TinyFish streaming URL domain
  const isValidStreamingUrl = (url: string | null): boolean => {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return (
        parsed.protocol === 'https:' &&
        (host.endsWith('.tinyfish.ai') || host.endsWith('.unikraft.app') || host === 'agent.tinyfish.ai')
      );
    } catch {
      return false;
    }
  };

  // Launch Live Streaming Run via SSE
  const handleStartLiveRun = async (useMock = isDemoMode) => {
    const runSequence = ++runSequenceRef.current;
    const isCurrentRun = () => runSequenceRef.current === runSequence && !cancelledRef.current;
    cancelledRef.current = false;
    setIsRunning(true);
    setRunStatus('RUNNING');
    setAttemptCount(1);
    setElapsedTime(0);
    setActiveError(null);
    setStreamingUrl(null);
    setStreamEvents([]);
    setLastCompletedRun(null);

    if (useMock) {
      setWorkstreams((prev) => prev.map((workstream) => ({
        ...workstream,
        status: 'running',
        message: 'Running deterministic demo fixture...',
      })));
    } else {
      setWorkstreams((prev) => prev.map((workstream) => ({
        ...workstream,
        status: 'running',
        message: 'Running as part of the concurrent live investigation; awaiting provider result.',
      })));
      try {
        const limitsResponse = await fetch('/api/investigations/limits');
        if (limitsResponse.ok && isCurrentRun()) {
          const limits = await limitsResponse.json();
          setAgentTimeoutMs(Number(limits.liveStreamTimeoutMs) || 120000);
        }
      } catch {
        // The configured timeout display is optional; provider execution proceeds independently.
      }
    }

    if (!isCurrentRun()) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/investigations/tinyfish/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(useMock ? { url: 'https://gem.gov.in', goal: `Synthetic procurement debarment search for ${targetName || 'the target vendor'}.` } : {}),
          targetName,
          identifiers: identifiers.slice(0, 5),
          useMock,
          mockScenario: 'STANDARD',
          ...(useMock ? { timeoutMs: 20000 } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status} connecting to streaming service.`);
      }

      if (!response.body) {
        throw new Error('Readable stream body is unavailable in this environment.');
      }

      const reader = response.body.getReader();
      streamReaderRef.current = reader;
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let terminalSeen = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done || !isCurrentRun()) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.replace(/^data:\s*/, '').trim();
          if (!jsonStr) continue;

          try {
            const ev: SanitizedStreamEvent = JSON.parse(jsonStr);
            if (!isCurrentRun()) break;
            setStreamEvents((prev) => [ev, ...prev.slice(0, 19)]);

            if (ev.runId) setActiveRunId(ev.runId);

            if (ev.type === 'STREAMING_URL' && ev.streamingUrl) {
              setStreamingUrl(ev.streamingUrl);
            }

            if (ev.type === 'PROGRESS') {
              setWorkstreams((prev) =>
                prev.map((w) => {
                  if (w.id === 'debarment') {
                    return {
                      ...w,
                      status: 'running',
                      message: ev.purpose || ev.message || 'Extracting structured table data...',
                    };
                  }
                  return w;
                })
              );
            }

            if (ev.type === 'COMPLETE') {
              terminalSeen = true;
              setIsRunning(false);
              const hasResult = Boolean(ev.result && typeof ev.result === 'object' && !Array.isArray(ev.result));
              const validCompletion = ev.status === 'COMPLETED' && hasResult;
              const debarmentTask = ev.result?.dimensions?.blacklist_debarment;
              const evidenceOutcome = debarmentTask?.evidenceSearchOutcome as string | undefined;
              const reportComplete = ev.result?.status === 'completed' && ev.result?.coverageStatus === 'COMPLETE';
              setRunStatus(useMock && validCompletion ? 'COMPLETED' : validCompletion ? reportComplete ? 'COMPLETED' : ev.result?.status === 'failed' ? 'FAILED' : 'PARTIAL' : 'FAILED');
              setWorkstreams((prev) => prev.map((workstream) => {
                if (useMock) {
                  return { ...workstream, status: validCompletion ? 'completed' : 'failed', message: validCompletion ? 'Synthetic demo task completed; no live evidence is claimed.' : 'Demo run completed without a valid result.' };
                }
                const dimensions = ev.result?.dimensions || {};
                const taskKeys = workstream.id === 'mca_gst'
                  ? ['company_registry', 'gst_compliance']
                  : workstream.id === 'litigation'
                  ? ['court_litigation']
                  : workstream.id === 'debarment'
                  ? ['blacklist_debarment']
                  : ['negative_news'];
                const tasks = taskKeys.map((key) => dimensions[key]).filter(Boolean);
                if (!tasks.length) return { ...workstream, status: 'unavailable', message: 'The live report did not include this verification result.' };
                const taskStates = tasks.map((task: any) => task.status === 'completed'
                  ? task.coverageGaps?.length || task.evidenceSearchOutcome === 'SOURCE_UNAVAILABLE' ? 'partial' : 'completed'
                  : task.status === 'unavailable' ? 'unavailable'
                  : task.status === 'cancelled' ? 'cancelled'
                  : 'failed');
                const status = taskStates.every((state: string) => state === 'completed') ? 'completed'
                  : taskStates.some((state: string) => state === 'completed' || state === 'partial') ? 'partial'
                  : taskStates.every((state: string) => state === 'unavailable') ? 'unavailable'
                  : taskStates.some((state: string) => state === 'cancelled') ? 'cancelled'
                  : 'failed';
                const details = tasks.flatMap((task: any) => [task.errorMessage, ...(task.coverageGaps || [])]).filter(Boolean).slice(0, 2);
                const evidenceMessage = workstream.id === 'debarment'
                  ? evidenceOutcome === 'MATCH_FOUND'
                    ? 'Potential match found; manually verify the source, identity, order, scope, and current validity.'
                    : evidenceOutcome === 'NO_MATCH_FOUND_IN_SEARCHED_SOURCES'
                    ? 'No match in the bounded sources searched; this does not establish a clean record.'
                    : 'Source content was unavailable or identity was ambiguous; manual review is required.'
                  : null;
                return {
                  ...workstream,
                  status,
                  message: [evidenceMessage, ...details].filter(Boolean).join(' ')
                    || (status === 'completed' ? 'Provider check completed; review the resulting evidence.' : 'Provider check did not complete; see the coverage details.'),
                };
              }));

              if (validCompletion) {
                setLastCompletedRun({
                  runId: ev.runId || 'tf_run_done',
                  completedAt: new Date().toLocaleTimeString(),
                  streamingUrl: ev.streamingUrl || streamingUrl,
                  result: ev.result,
                  elapsedMs: typeof ev.elapsedMs === 'number' && Number.isFinite(ev.elapsedMs) ? ev.elapsedMs : elapsedTime * 100,
                });
              } else {
                setActiveError('The agent finished without a validated result. No successful investigation is reported.');
              }
            }

            if (ev.type === 'ERROR') {
              terminalSeen = true;
              setIsRunning(false);
              const timedOut = ev.errorCategory === 'TIMEOUT';
              const failureStatus = timedOut
                ? 'TIMED_OUT'
                : ev.errorCategory === 'AUTH'
                ? 'AUTH_ERROR'
                : ev.errorCategory === 'RATE_LIMIT'
                ? 'RATE_LIMITED'
                : ev.errorCategory
                ? 'UPSTREAM_FAILURE'
                : 'FAILED';
              setRunStatus(failureStatus);
              setActiveError(ev.errorMessage || 'Streaming error encountered');
              setWorkstreams((prev) =>
                prev.map((w) => (w.status === 'running' ? {
                  ...w,
                  status: timedOut ? 'timed_out' : 'failed',
                  message: timedOut
                    ? 'TIMED_OUT with partial GeM/CVC coverage; progress is unverified and no clean-standing finding was verified.'
                    : ev.errorMessage || 'Agent failed.',
                } : w))
              );
            }

            if (ev.type === 'CANCELED') {
              terminalSeen = true;
              setIsRunning(false);
              setRunStatus('CANCELLED');
              setWorkstreams((prev) => prev.map((workstream) => workstream.status === 'running'
                ? { ...workstream, status: 'cancelled', message: 'Cancelled by operator.' }
                : workstream));
            }
          } catch {
            // Ignore malformed individual chunk
          }
        }
      }
      if (isCurrentRun() && !controller.signal.aborted && !terminalSeen) {
        setIsRunning(false);
        setRunStatus('PARTIAL');
        setWorkstreams((prev) => prev.map((workstream) => workstream.status === 'running'
          ? { ...workstream, status: 'partial', message: 'Stream ended before a validated terminal result.' }
          : workstream));
      }
    } catch (err: any) {
      if (!isCurrentRun()) return;
      if (err.name !== 'AbortError') {
        setActiveError(err.message || 'Stream connection failed');
        setRunStatus('FAILED');
      }
      setIsRunning(false);
    } finally {
      if (runSequenceRef.current === runSequence) {
        streamReaderRef.current = null;
        abortControllerRef.current = null;
      }
    }
  };

  // Cancel in-flight run
  const handleCancelRun = async () => {
    cancelledRef.current = true;
    runSequenceRef.current += 1;
    setRunStatus('CANCELLED');
    setIsRunning(false);
    setStreamingUrl(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (streamReaderRef.current) {
      try {
        await streamReaderRef.current.cancel();
      } catch {
        // The aborted stream may already be closed.
      }
    }
    if (activeRunId && !activeRunId.startsWith('tf_search_')) {
      try {
        await fetch('/api/investigations/tinyfish/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId: activeRunId, useMock: isDemoMode }),
        });
      } catch {
        setActiveError('Cancellation was sent locally; upstream cancellation could not be confirmed.');
      }
    }
    setActiveRunId(null);
    setWorkstreams((prev) =>
      prev.map((w) => (w.status === 'running' ? { ...w, status: 'cancelled', message: 'Cancelled by operator.' } : w))
    );
  };

  const formattedTime = (elapsedTime / 10).toFixed(1);
  const remainingAgentSeconds = Math.max(0, Math.ceil((agentTimeoutMs - elapsedTime * 100) / 1000));
  const completedReport = lastCompletedRun?.result;
  const hasPartialCoverage = Boolean(completedReport?.dimensions && completedReport.coverageStatus !== 'COMPLETE');
  const reportFailed = Boolean(completedReport?.dimensions && completedReport.status === 'failed');

  return (
    <div className="bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg p-5 space-y-5">
      {/* Workbench Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#EAE6DF]">
        <div>
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${isRunning ? 'text-amber-600 animate-pulse' : 'text-[#1C1F26]'}`} />
            <h2 className="text-sm font-bold text-[#1C1F26] uppercase tracking-wide">
              {isDemoMode ? 'Demo Investigation Event Workbench' : 'Live Search & Evidence Workbench'}
            </h2>
          </div>
          <p className="text-xs text-[#5F6572] mt-0.5">
            {isDemoMode
              ? 'Deterministic synthetic event stream for demonstration. No live browser session or upstream audit is claimed.'
              : 'VendorTrace runs bounded registry, court, procurement, and adverse-media checks. Missing or inaccessible evidence never verifies a clean record.'}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              type="button"
              onClick={handleCancelRun}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Square className="w-3 h-3" />
              <span>Cancel Run</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleStartLiveRun(isDemoMode)}
              disabled={!targetName.trim()}
              title={!targetName.trim() ? 'Enter a company or vendor name before launching.' : undefined}
              className="px-3.5 py-1.5 bg-[#1C1F26] hover:bg-[#2D323E] disabled:bg-[#A8A8A8] disabled:cursor-not-allowed text-white rounded text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>{isDemoMode ? 'Run Demo Agent Simulation' : 'Launch Live Agent Stream'}</span>
            </button>
          )}

          {isRunning && (
            <div className="px-2.5 py-1 bg-white border border-[#EAE6DF] rounded font-mono text-xs text-[#1C1F26] flex items-center gap-1.5 shadow-xs">
              <Clock className="w-3 h-3 text-amber-600 animate-spin" />
              <span>{formattedTime}s</span>
            </div>
          )}
          {runStatus !== 'IDLE' && (
            <div className="text-[10px] font-mono text-[#5F6572] bg-white border border-[#EAE6DF] rounded px-2 py-1" role="status">
              {runStatus} · {attemptCount}/2 attempts
              {isRunning && ` · ${remainingAgentSeconds}s agent time left`}
            </div>
          )}
        </div>
      </div>

      {/* 4 Real Workstreams Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-3">
        {workstreams.map((ws) => {
          const Icon = ws.icon;
          const isDone = ws.status === 'completed';
          const isCurrent = ws.status === 'running';
          const isFailed = ws.status === 'failed' || ws.status === 'timed_out';
          const dimensionKeys = ws.id === 'mca_gst'
            ? ['company_registry', 'gst_compliance']
            : ws.id === 'litigation'
            ? ['court_litigation']
            : ws.id === 'debarment'
            ? ['blacklist_debarment']
            : ['negative_news'];
          const dimensionDetails = dimensionKeys
            .map((key) => ({ key, result: completedReport?.dimensions?.[key] }))
            .filter((item) => item.result);

          return (
            <div
              key={ws.id}
              className={`p-3.5 rounded-lg border text-left flex flex-col justify-between transition-all ${
                isDone
                  ? 'bg-white border-emerald-200'
                  : isCurrent
                  ? 'bg-white border-amber-300 ring-2 ring-amber-200/50'
                  : isFailed
                  ? 'bg-rose-50 border-rose-200'
                  : ws.status === 'cancelled' || ws.status === 'unavailable' || ws.status === 'blocked'
                  ? 'bg-slate-50 border-slate-200'
                  : ws.status === 'partial'
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-[#F4F1EA]/50 border-[#EAE6DF]'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="p-1 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[#1C1F26]">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  {isDone ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Done
                    </span>
                  ) : isCurrent ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-300 animate-pulse">
                      <Clock className="w-2.5 h-2.5 text-amber-600 animate-spin" /> {isDemoMode ? 'Simulating' : 'Live'}
                    </span>
                  ) : isFailed ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                      <XCircle className="w-2.5 h-2.5 text-rose-600" /> {ws.status === 'timed_out' ? 'Timed out' : 'Error'}
                    </span>
                  ) : ws.status === 'cancelled' ? (
                    <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-300">Cancelled</span>
                  ) : ws.status === 'unavailable' ? (
                    <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-300">Unavailable</span>
                  ) : ws.status === 'blocked' ? (
                    <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-300">Not run</span>
                  ) : ws.status === 'partial' ? (
                    <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-300">Partial</span>
                  ) : (
                    <span className="text-[10px] text-[#8A91A0] font-mono">{!isRunning && !lastCompletedRun && !activeError ? 'Idle' : 'Queued'}</span>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-bold text-[#1C1F26] leading-tight">
                    {ws.name}
                  </h4>
                  <span className="text-[10px] text-[#8A91A0] block mt-0.5">
                    {isDemoMode ? 'Synthetic demo simulation' : ws.provider}
                  </span>
                </div>
              </div>

              <div className="pt-2 mt-2 border-t border-[#EAE6DF]/70 text-[11px] text-[#5F6572] break-words italic">
                &ldquo;{ws.message}&rdquo;
              </div>
              {dimensionDetails.length > 0 && (
                <details className="mt-2 border-t border-[#EAE6DF] pt-2 text-[10px] not-italic">
                  <summary className="cursor-pointer font-semibold text-[#1C1F26]">View checked sources and coverage details</summary>
                  <div className="mt-2 space-y-3">
                    {dimensionDetails.map(({ key, result }: any) => (
                      <div key={key} className="space-y-1.5 rounded border border-[#EAE6DF] bg-white p-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <strong className="text-[#1C1F26]">{result.title || key.replace(/_/g, ' ')}</strong>
                          <span className="rounded bg-[#F4F1EA] px-1.5 py-0.5 font-mono text-[9px] text-[#5F6572]">{result.status}</span>
                        </div>
                        <div className="text-[#5F6572]">Provider: {result.provider || ws.provider} · Checked sources: {result.sourceCount ?? result.sourcesChecked?.length ?? 0}{result.attemptCount !== undefined ? ` · Attempts: ${result.attemptCount}` : ''}{result.durationMs != null ? ` · ${result.durationMs}ms` : ''}</div>
                        {result.sourcesChecked?.length > 0 && <div className="text-[#5F6572]"><strong>Sources checked:</strong> {result.sourcesChecked.join(' · ')}</div>}
                        {result.errorMessage && <div className="rounded bg-amber-50 px-2 py-1.5 text-amber-950"><strong>Why coverage is limited:</strong> {result.errorMessage}</div>}
                        {result.coverageGaps?.length > 0 && (
                          <ul className="list-disc space-y-0.5 pl-4 text-amber-900">{result.coverageGaps.map((gap: string, index: number) => <li key={`${key}-gap-${index}`}>{gap}</li>)}</ul>
                        )}
                        {result.findings?.length > 0 ? result.findings.map((finding: any, findingIndex: number) => (
                          <div key={`${key}-finding-${findingIndex}`} className="border-t border-[#EAE6DF] pt-1.5">
                            <div className="font-semibold text-[#1C1F26]">{finding.title}</div>
                            <p className="mt-0.5 text-[#5F6572]">{finding.neutralSummary}</p>
                            {(finding.evidence || []).map((evidence: any, evidenceIndex: number) => (
                              <div key={`${key}-evidence-${evidenceIndex}`} className="mt-1 text-[#5F6572]">
                                <div><strong>{evidence.sourceTitle || evidence.sourceName}</strong>{evidence.publisher ? ` · ${evidence.publisher}` : ''}</div>
                                {evidence.url ? <a href={evidence.url} target="_blank" rel="noopener noreferrer" className="break-all text-blue-700 hover:underline">{evidence.url}</a> : <div className="text-amber-800">No direct source URL supplied.</div>}
                                {evidence.snippet && <p className="mt-0.5">Excerpt: {evidence.snippet}</p>}
                                {evidence.identityMatchNote && <p className="mt-0.5">Identity match: {evidence.identityMatchNote}</p>}
                              </div>
                            ))}
                          </div>
                        )) : <p className="text-[#8A91A0]">No validated finding was returned for this dimension.</p>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {/* Live Browser Preview Section */}
      {streamingUrl && isValidStreamingUrl(streamingUrl) ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#1C1F26] flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-emerald-600" />
              Live TinyFish Browser Session (Remote Unikraft Environment)
            </span>
            <a
              href={streamingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1C1F26] hover:underline flex items-center gap-1 text-[11px]"
            >
              <span>Open live run in new window</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="relative w-full aspect-video sm:h-80 bg-black rounded-lg overflow-hidden border border-[#D5CEC2] shadow-inner">
            <iframe
              src={streamingUrl}
              title="TinyFish Live Browser Automation Stream"
              sandbox="allow-scripts allow-same-origin"
              className="w-full h-full border-0"
            />
          </div>
        </div>
      ) : streamingUrl ? (
        // Safe fallback link if URL is provided but cannot be embedded
        <div className="p-3 bg-white border border-[#EAE6DF] rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold text-[#1C1F26]">
              Live TinyFish Remote Session Ready
            </span>
          </div>
          <a
            href={streamingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-[#1C1F26] text-white rounded text-xs font-medium hover:bg-[#2D323E] flex items-center gap-1.5"
          >
            <span>Open live run</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      ) : null}

      {/* Compact Recording / Preview Card after Completion */}
      {lastCompletedRun && !isRunning && (
        <div className={`p-4 rounded-lg shadow-xs space-y-2 border ${reportFailed ? 'bg-rose-50 border-rose-200' : hasPartialCoverage ? 'bg-amber-50 border-amber-200' : 'bg-white border-emerald-200'}`}>
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {reportFailed
                ? <XCircle className="w-4 h-4 text-rose-600" />
                : hasPartialCoverage
                ? <AlertTriangle className="w-4 h-4 text-amber-600" />
                : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              <span className="font-bold text-[#1C1F26]">
                {completedReport?.dimensions
                  ? `LAYER 1 ONLY · ${reportFailed ? 'FAILED' : hasPartialCoverage ? 'PARTIAL COVERAGE' : 'COMPLETE'} · ${completedReport.summary?.verdict || 'REVIEW'}`
                  : lastCompletedRun.result?.evidenceSearchOutcome || 'Provider Run Completed'}
              </span>
              <span className="text-[10px] font-mono text-[#8A91A0]">
                Finished at {lastCompletedRun.completedAt} ({lastCompletedRun.elapsedMs}ms)
              </span>
            </div>
            {lastCompletedRun.streamingUrl && (
              <a
                href={lastCompletedRun.streamingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#1C1F26] hover:underline flex items-center gap-1"
              >
                <span>Replay Browser Session</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <p className="text-[11px] text-[#5F6572]">
            {completedReport?.dimensions
              ? !hasPartialCoverage && !reportFailed
                ? 'All configured workstreams completed. Review the evidence and coverage notes before making a decision.'
                : 'The workstreams ran, but one or more sources were unavailable or coverage was incomplete. Review each result; missing evidence does not establish clean standing.'
              : lastCompletedRun.result?.evidenceSearchOutcome === 'MATCH_FOUND'
              ? 'A relevant fetched source matched the vendor identity. Review the original document before relying on the result.'
              : lastCompletedRun.result?.evidenceSearchOutcome === 'NO_MATCH_FOUND_IN_SEARCHED_SOURCES'
              ? 'No match was found in the searched sources. This does not verify a clean debarment record.'
              : lastCompletedRun.result?.evidenceSearchOutcome === 'SOURCE_UNAVAILABLE'
              ? 'Some source content was inaccessible or entity identity was ambiguous. Manual review is required.'
              : 'Synthetic provider result; no live source evidence is claimed.'}
          </p>
          {(lastCompletedRun.result?.findings || []).flatMap((finding: any) => finding.evidence || []).slice(0, 3).map((evidence: any, index: number) => (
            <div key={`${evidence.url || evidence.sourceName}-${index}`} className="border-t border-[#EAE6DF] pt-2 text-[11px] space-y-1">
              <div className="font-semibold text-[#1C1F26]">{evidence.sourceTitle || evidence.underlyingSource || evidence.sourceName}</div>
              {evidence.url
                ? <a href={evidence.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline break-all">Direct source: {evidence.url}</a>
                : <div className="text-amber-800">No direct source URL supplied.</div>}
              {evidence.searchResultUrl && <a href={evidence.searchResultUrl} target="_blank" rel="noopener noreferrer" className="text-amber-800 hover:underline break-all">Search result URL (source not fetched): {evidence.searchResultUrl}</a>}
              {evidence.sourceFetchError && <div className="text-amber-900 bg-amber-50 border border-amber-200 rounded p-2">Source fetch failed: {evidence.sourceFetchError}. Identity and finding remain unverified.</div>}
              {evidence.searchQuery && <div className="text-[#5F6572]"><span className="font-semibold">Query:</span> {evidence.searchQuery}</div>}
              {evidence.snippet && <div className="text-[#5F6572]">Excerpt: {evidence.snippet}</div>}
              <div className="text-[#8A91A0]">{evidence.sourceFetchError ? 'Attempted' : 'Retrieved'} {evidence.capturedAt} · {evidence.identityMatchNote}</div>
            </div>
          ))}
        </div>
      )}

      {/* Error & Safe Retry Notice */}
      {activeError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-rose-900">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>{runStatus === 'FAILED' || runStatus === 'TIMED_OUT' || runStatus === 'UPSTREAM_FAILURE' ? 'Stream Error: ' : 'Stream Notice: '}</strong> {activeError}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleStartLiveRun(isDemoMode)}
            className="px-3 py-1 bg-rose-700 hover:bg-rose-800 text-white rounded text-xs font-medium self-end sm:self-auto flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Rerun Layer 1 checks</span>
          </button>
        </div>
      )}

      {/* Stream Events Ledger */}
      {streamEvents.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-[#EAE6DF]">
          <span className="text-[10px] font-bold text-[#8A91A0] uppercase tracking-wider block">
            {isDemoMode ? 'Demo Event Log' : 'Search Workflow Events'} ({streamEvents.length})
          </span>
          <div className="space-y-1 max-h-32 overflow-y-auto font-mono text-[10px] bg-white p-2.5 rounded border border-[#EAE6DF]">
            {streamEvents.map((ev, i) => (
              <div key={i} className="flex items-center gap-2 text-[#5F6572]">
                <span className="text-[#8A91A0]">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                <span className="font-bold text-[#1C1F26] px-1 rounded bg-[#FAF8F5] border border-[#EAE6DF]">
                  {ev.type}
                </span>
                <span className="truncate">{ev.message || ev.purpose || `Run ID: ${ev.runId}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
