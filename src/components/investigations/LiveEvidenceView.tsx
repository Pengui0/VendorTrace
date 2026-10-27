import React, { useEffect, useState } from 'react';
import { ArrowDownToLine, Radio, Search } from 'lucide-react';
import type { Investigation } from '../../types/vendor.js';
import type { IdentifierType } from '../../types/vendor.js';
import { detectIdentifierKind } from '../../server/providers/identifierDetector.js';
import { LiveStreamingWorkbench } from './LiveStreamingWorkbench.js';

const TARGET_STORAGE_KEY = 'vendortrace.live-workbench-target.v1';

interface SavedTarget {
  targetName: string;
  identifier: string;
}

function readSavedTarget(fallback: SavedTarget): SavedTarget {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = JSON.parse(window.localStorage.getItem(TARGET_STORAGE_KEY) || 'null');
    if (typeof saved?.targetName === 'string' && typeof saved?.identifier === 'string') return saved;
  } catch {
    // Use the active report as a sensible starting point if browser storage is unavailable.
  }
  return fallback;
}

interface LiveEvidenceViewProps {
  investigation: Investigation | null;
  investigations: Investigation[];
  isDemoMode: boolean;
  isInvestigating: boolean;
  onRunFullInvestigation: (params: { targetName: string; identifierType: IdentifierType; identifierValue: string }) => void;
}

export const LiveEvidenceView: React.FC<LiveEvidenceViewProps> = ({ investigation, investigations, isDemoMode, isInvestigating, onRunFullInvestigation }) => {
  const fallbackTarget = {
    targetName: investigation?.targetName || '',
    identifier: investigation && investigation.identifierType !== 'NAME' ? investigation.identifierValue : '',
  };
  const [targetName, setTargetName] = useState(() => readSavedTarget(fallbackTarget).targetName);
  const [identifier, setIdentifier] = useState(() => readSavedTarget(fallbackTarget).identifier);
  const [selectedHistoryId, setSelectedHistoryId] = useState('');

  useEffect(() => {
    try {
      window.localStorage.setItem(TARGET_STORAGE_KEY, JSON.stringify({ targetName, identifier }));
    } catch {
      // The workbench remains usable for this session if browser storage is disabled or full.
    }
  }, [targetName, identifier]);

  const useOpenReport = () => {
    if (!investigation) return;
    setTargetName(investigation.targetName);
    setIdentifier(investigation.identifierType === 'NAME' ? '' : investigation.identifierValue);
  };

  const useHistoryReport = (reportId: string) => {
    setSelectedHistoryId(reportId);
    const report = investigations.find((item) => item.id === reportId);
    if (!report) return;
    setTargetName(report.targetName);
    setIdentifier(report.identifierType === 'NAME' ? '' : report.identifierValue);
  };

  const runFullInvestigation = () => {
    const detected = detectIdentifierKind(identifier);
    const identifierType: IdentifierType = detected.kind === 'COMPANY_NAME'
      ? 'NAME'
      : detected.kind === 'LLPIN'
        ? 'CIN'
        : detected.kind;
    onRunFullInvestigation({
      targetName: targetName.trim(),
      identifierType,
      identifierValue: detected.kind === 'COMPANY_NAME' ? '' : detected.normalizedValue,
    });
  };

  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-2 border-b border-[#EAE6DF] pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
            <Radio className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800">Separate live workspace</p>
            <h1 className="text-xl font-bold tracking-tight text-[#1C1F26]">Live Search & Evidence</h1>
          </div>
          <span className="ml-auto rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold tracking-wider text-emerald-800">LAYER 1 ONLY · {isDemoMode ? 'DEMO' : 'LIVE'}</span>
        </div>
        <p className="max-w-3xl text-xs leading-relaxed text-[#5F6572]">
          Run and review the bounded registry, court, procurement, and adverse-media workstreams here. This workspace is separate from the standard investigation report and history.
        </p>
        <div className="rounded-lg border border-[#EAE6DF] bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-[#1C1F26]">This live workspace runs Layer 1 discovery only</p>
              <p className="mt-0.5 text-[11px] text-[#5F6572]">A partial result below describes Layer 1 coverage only; it does not mean the other layers failed.</p>
            </div>
            <button type="button" onClick={runFullInvestigation} disabled={!targetName.trim() || isInvestigating} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-[#1C1F26] px-3.5 py-2 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#2D323E] disabled:cursor-not-allowed disabled:bg-slate-300">
              {isInvestigating ? 'Full investigation running…' : 'Run full investigation · Layers 1–3'}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            {[
              ['Layer 1 · Discovery', 'Runs here'],
              ['Layer 2 · Entity tracing', 'Full investigation'],
              ['Layer 3 · Cross-validation', 'Full investigation'],
              ['Layer 4 · Monitoring', 'Compare saved reports'],
            ].map(([label, scope], index) => (
              <div key={label} className={`rounded-md border px-2.5 py-2 ${index === 0 ? 'border-emerald-200 bg-emerald-50/70' : 'border-[#EAE6DF] bg-[#FCFBF9]'}`}>
                <p className="text-[10px] font-bold text-[#1C1F26]">{label}</p>
                <p className="mt-0.5 text-[10px] text-[#5F6572]">{scope}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1C1F26]">
            <Search className="h-4 w-4 text-emerald-700" /> Search target
          </div>
          {investigation && (
            <button type="button" onClick={useOpenReport} className="inline-flex items-center gap-1.5 rounded border border-emerald-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100">
              <ArrowDownToLine className="h-3.5 w-3.5" /> Use open investigation
            </button>
          )}
        </div>
        <label className="mb-3 block space-y-1 text-[11px] font-medium text-[#5F6572]">
          Choose a saved report as the live-search target
          <select value={selectedHistoryId} onChange={(event) => useHistoryReport(event.target.value)} className="w-full rounded border border-[#D5CEC2] bg-white px-3 py-2 text-sm text-[#1C1F26] outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100">
            <option value="">Select from report history…</option>
            {investigations.map((report) => (
              <option key={report.id} value={report.id}>
                {report.targetName} · {report.identifierValue || report.identifierType} · {report.status === 'PARTIAL_FAILURE' ? 'Partial coverage' : report.status} · {new Date(report.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1 text-[11px] font-medium text-[#5F6572]">
            Company or vendor name
            <input value={targetName} onChange={(event) => setTargetName(event.target.value)} placeholder="Enter company name" className="w-full rounded border border-[#D5CEC2] bg-white px-3 py-2 text-sm text-[#1C1F26] outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
          </label>
          <label className="space-y-1 text-[11px] font-medium text-[#5F6572]">
            CIN, GSTIN, PAN, or other identifier (optional)
            <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Add an exact identifier to improve matching" className="w-full rounded border border-[#D5CEC2] bg-white px-3 py-2 text-sm text-[#1C1F26] outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
          </label>
        </div>
      </div>

      <LiveStreamingWorkbench
        targetName={targetName.trim()}
        identifiers={identifier.trim() ? [identifier.trim()] : []}
        isInvestigating={false}
        isDemoMode={isDemoMode}
      />
    </section>
  );
};
