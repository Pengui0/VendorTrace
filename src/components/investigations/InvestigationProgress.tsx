import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Building2,
  Receipt,
  Scale,
  ShieldAlert,
  Newspaper,
  Layers,
  Cpu,
} from 'lucide-react';
import { DimensionTaskResult, DimensionTaskState } from '../../types/riskFinding.js';

interface InvestigationProgressProps {
  currentStep?: number;
  isActive: boolean;
  dimensionResults?: Record<string, DimensionTaskResult>;
  coverageGaps?: string[];
  totalDurationMs?: number;
  coverageStatus?: 'COMPLETE' | 'PARTIAL';
  terminationReason?: 'TIMEOUT' | 'CANCELLED' | null;
  onCancel?: () => void;
}

interface DimensionConfig {
  key: string;
  name: string;
  category: string;
  defaultProvider: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DIMENSION_CONFIGS: DimensionConfig[] = [
  {
    key: 'company_registry',
    name: 'Company Identity & MCA21',
    category: 'Corporate Registry',
    defaultProvider: 'IndiaCos MCA21 Gateway',
    icon: Building2,
  },
  {
    key: 'gst_compliance',
    name: 'GST Filing & Jurisdiction',
    category: 'Tax Compliance',
    defaultProvider: 'IndiaCos GSTN Gateway',
    icon: Receipt,
  },
  {
    key: 'court_litigation',
    name: 'E-Courts & Tribunals',
    category: 'Litigation & Insolvency',
    defaultProvider: 'IndiaCos Case API / TinyFish Legal',
    icon: Scale,
  },
  {
    key: 'blacklist_debarment',
    name: 'Public Debarment & Penalties',
    category: 'GeM & Central Procurement',
    defaultProvider: 'TinyFish Web Agent',
    icon: ShieldAlert,
  },
  {
    key: 'negative_news',
    name: 'Adverse Regulatory Media',
    category: 'Financial Press & News',
    defaultProvider: 'TinyFish Media Search',
    icon: Newspaper,
  },
];

export const InvestigationProgress: React.FC<InvestigationProgressProps> = ({
  isActive,
  dimensionResults,
  coverageGaps = [],
  totalDurationMs,
  coverageStatus,
  terminationReason,
  onCancel,
}) => {
  const [activeElapsedMs, setActiveElapsedMs] = useState(0);
  const [cancellationRequested, setCancellationRequested] = useState(false);
  const [limits, setLimits] = useState({ overallTimeoutMs: 120000, agentTimeoutMs: 45000, maxAttempts: 2 });

  useEffect(() => {
    if (!isActive) setCancellationRequested(false);
  }, [isActive]);

  useEffect(() => {
    fetch('/api/investigations/limits')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then((data) => setLimits({
        overallTimeoutMs: Number(data.overallTimeoutMs) || 120000,
        agentTimeoutMs: Number(data.agentTimeoutMs) || 45000,
        maxAttempts: Number(data.maxAttempts) || 2,
      }))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isActive) {
      setActiveElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => setActiveElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(timer);
  }, [isActive]);

  const remainingSeconds = isActive ? Math.max(0, Math.ceil((limits.overallTimeoutMs - activeElapsedMs) / 1000)) : null;

  const getStateBadge = (state: DimensionTaskState | 'queued', errorCategory?: string | null, hasCoverageGaps = false) => {
    switch (state) {
      case 'completed':
        if (hasCoverageGaps) return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-900 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-2.5 h-2.5 text-amber-700" /> Partial
          </span>
        );
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
            Completed
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-full animate-pulse">
            <Clock className="w-2.5 h-2.5 text-amber-600 animate-spin" />
            Running...
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
            <XCircle className="w-2.5 h-2.5 text-rose-600" />
            {errorCategory === 'TIMEOUT' ? 'Timed out' : `Failed ${errorCategory ? `(${errorCategory})` : ''}`}
          </span>
        );
      case 'unavailable':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-700 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-full">
            <HelpCircle className="w-2.5 h-2.5 text-slate-500" />
            Unavailable
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-700 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-full">
            <XCircle className="w-2.5 h-2.5 text-slate-500" />
            Cancelled
          </span>
        );
      case 'queued':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#8A91A0] bg-[#FAF8F5] border border-[#EAE6DF] px-2 py-0.5 rounded-full">
            <Clock className="w-2.5 h-2.5 text-[#8A91A0]" />
            Queued
          </span>
        );
    }
  };

  return (
    <div className="bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg p-4 space-y-4">
      {/* Header with real task execution metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#EAE6DF]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-[#1C1F26] uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-[#1C1F26]" />
            Layer 1 Discovery Orchestration Engine
          </span>
          {isActive ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold animate-pulse border border-amber-300">
              Running Concurrent Risk Tasks...
            </span>
          ) : coverageStatus ? (
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-medium border ${coverageStatus === 'COMPLETE' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-amber-50 text-amber-950 border-amber-300'}`}>
              Coverage: {coverageStatus}
            </span>
          ) : (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium border border-slate-300">
              Audit State: Not run
            </span>
          )}
          {terminationReason && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold border border-amber-300">
              {terminationReason === 'TIMEOUT' ? 'Timed out' : 'Cancelled'}
            </span>
          )}
          {isActive && onCancel && (
            <button
              type="button"
              disabled={cancellationRequested}
              onClick={() => {
                setCancellationRequested(true);
                onCancel();
              }}
              className="text-[10px] font-semibold px-2 py-1 rounded border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 disabled:opacity-60"
            >
              {cancellationRequested ? 'Cancelling...' : 'Cancel investigation'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-[#5F6572]">
          {isActive && (
            <span className="font-mono text-[10px] bg-white px-2 py-0.5 rounded border border-[#EAE6DF]">
              Elapsed: {Math.floor(activeElapsedMs / 1000)}s · Overall remaining: {remainingSeconds}s · Agent limit: {Math.ceil(limits.agentTimeoutMs / 1000)}s · Max attempts: {limits.maxAttempts}
            </span>
          )}
          {!isActive && totalDurationMs !== undefined && (
            <span className="font-mono text-[10px] bg-white px-2 py-0.5 rounded border border-[#EAE6DF]">
              Total Latency: {totalDurationMs}ms
            </span>
          )}
          <span className="font-semibold text-[#1C1F26]">
            Zero-Fabrication Guarantee
          </span>
        </div>
      </div>

      {/* Grid of Real Dimension Tasks */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-3">
        {DIMENSION_CONFIGS.map((dim) => {
          const result = dimensionResults ? dimensionResults[dim.key] : undefined;
          const resultFindings = Array.isArray(result?.findings) ? result.findings : [];
          const checkedSourceCount =
            typeof result?.sourceCount === 'number'
              ? result.sourceCount
              : Array.isArray(result?.sourcesChecked)
                ? result.sourcesChecked.length
                : 0;
          const taskState: DimensionTaskState | 'queued' = result?.status || 'queued';
          const taskHasCoverageGaps = Boolean(result?.coverageGaps?.length);
          const sourceNames = Array.isArray(result?.sourcesChecked) ? result.sourcesChecked.filter(Boolean) : [];
          const detailLines = Array.from(new Set([...(result?.coverageGaps || []), result?.errorMessage].filter((line): line is string => Boolean(line)))).slice(0, 3);

          const IconComponent = dim.icon;
          const isFailed = taskState === 'failed';
          const isUnavailable = taskState === 'unavailable';

          return (
            <div
              key={dim.key}
              className={`p-3 rounded-lg border transition-all text-left flex flex-col justify-between ${
                taskState === 'completed' && taskHasCoverageGaps
                  ? 'bg-amber-50/60 border-amber-200'
                  : taskState === 'completed'
                  ? 'bg-white border-emerald-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]'
                  : taskState === 'running'
                  ? 'bg-white border-amber-300 ring-2 ring-amber-200/60'
                  : isFailed
                  ? 'bg-rose-50/40 border-rose-200'
                  : isUnavailable
                  ? 'bg-slate-50/70 border-slate-200'
                  : 'bg-[#F4F1EA]/50 border-[#EAE6DF] text-[#8A91A0]'
              }`}
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-1">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <div className="p-1 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[#1C1F26]">
                      <IconComponent className="w-3.5 h-3.5" />
                    </div>
                    <span className="min-w-0 text-[10px] font-mono text-[#8A91A0] uppercase">
                      {dim.category}
                    </span>
                  </div>
                  <span className="shrink-0">
                    {getStateBadge(taskState, result?.errorCategory, taskHasCoverageGaps)}
                  </span>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-[#1C1F26] leading-tight">
                    {dim.name}
                  </h4>
                  <p className="text-[10px] text-[#5F6572] mt-0.5 break-words">
                    Provider: {result?.provider || dim.defaultProvider}
                  </p>
                </div>
              </div>

              {/* Task metrics & findings count */}
              <div className="pt-2.5 mt-2 border-t border-[#EAE6DF]/70 text-[10px] space-y-0.5">
                {result ? (
                  <>
                    <div className="flex items-center justify-between text-[#5F6572]">
                      <span>Checked Sources:</span>
                      <strong className="text-[#1C1F26] font-mono">{checkedSourceCount}</strong>
                    </div>
                    {result.attemptCount !== undefined && (
                      <div className="flex items-center justify-between text-[#5F6572]">
                        <span>Attempts:</span>
                        <span className="font-mono text-[9px] text-[#8A91A0]">{result.attemptCount}/{limits.maxAttempts}</span>
                      </div>
                    )}
                    {result.durationMs !== null && (
                      <div className="flex items-center justify-between text-[#5F6572]">
                        <span>Duration:</span>
                        <span className="font-mono text-[9px] text-[#8A91A0]">{result.durationMs}ms / {limits.agentTimeoutMs}ms</span>
                      </div>
                    )}
                    {resultFindings.length > 0 ? (
                      <div className="text-[10px] font-medium text-emerald-800">
                        {resultFindings.length} signal{resultFindings.length === 1 ? '' : 's'} recorded
                      </div>
                    ) : (
                      <div className="text-[9px] text-[#8A91A0] italic">
                        {taskState === 'completed' && checkedSourceCount > 0
                          ? 'No signal in checked sources'
                          : 'No validated evidence'}
                      </div>
                    )}
                    {sourceNames.length > 0 && (
                      <div className="pt-1 text-[9px] leading-relaxed text-[#5F6572]">
                        <span className="font-semibold">Sources:</span> {sourceNames.join(' · ')}
                      </div>
                    )}
                    {detailLines.length > 0 && (
                      <div className={`mt-1 rounded border p-2 text-[9px] leading-relaxed ${isUnavailable || isFailed ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-[#EAE6DF] bg-white text-[#5F6572]'}`}>
                        <span className="font-semibold">Coverage detail:</span>
                        <ul className="mt-0.5 list-disc space-y-0.5 pl-3">
                          {detailLines.map((line, index) => <li key={`${dim.key}-detail-${index}`}>{line}</li>)}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[10px] text-[#8A91A0]">
                    {isActive ? 'Awaiting task result...' : 'Standby for run'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Prominent Coverage Gaps Notice if any dimensions failed or were unavailable */}
      {coverageGaps.length > 0 && (
        <div className="p-3 bg-amber-50/80 border border-amber-300 rounded text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-amber-950">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>Coverage Gaps Identified ({coverageGaps.length})</span>
          </div>
          <p className="text-[11px] text-amber-900 leading-snug">
            Under VendorTrace zero-fabrication discipline, unavailable registry sources or timeout errors are never converted into clean risk assumptions. Manual verification or connector credentials required for:
          </p>
          <ul className="list-disc list-inside text-[11px] text-amber-950 space-y-0.5 pt-0.5">
            {coverageGaps.map((gap, idx) => (
              <li key={idx} className="font-medium">
                {gap}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
