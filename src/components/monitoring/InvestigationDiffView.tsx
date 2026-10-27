import React, { useState, useEffect } from 'react';
import { Investigation } from '../../types/vendor.js';
import { loadWorkspace, updateWorkspace } from '../../persistence/localStore.js';
import { validateInvestigationComparison } from '../../utils/investigationComparison.js';
import {
  RunComparisonReport,
  SignalDiffItem,
  MonitoringConfig,
  MonitoringFrequencyPreference,
} from '../../types/monitoringDiff.js';
import { Card } from '../common/Card.js';
import { Badge } from '../common/Badge.js';
import { EmptyState } from '../common/EmptyState.js';
import {
  GitCompareArrows,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  ExternalLink,
  ShieldAlert,
  Info,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface InvestigationDiffViewProps {
  currentInvestigation: Investigation | null;
  comparisonSelection?: { baselineId: string; latestId: string } | null;
  allInvestigations: Investigation[];
  isDemoMode: boolean;
  onInvestigationUpdated?: (updatedInv: Investigation) => void;
}

export const InvestigationDiffView: React.FC<InvestigationDiffViewProps> = ({
  currentInvestigation,
  comparisonSelection,
  allInvestigations,
  isDemoMode,
  onInvestigationUpdated,
}) => {
  const [isReRunning, setIsReRunning] = useState<boolean>(false);
  const [comparisonReport, setComparisonReport] = useState<RunComparisonReport | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [selectedBaselineId, setSelectedBaselineId] = useState<string>('');
  const [selectedLatestId, setSelectedLatestId] = useState<string>('');
  const [rerunTargetId, setRerunTargetId] = useState<string>(currentInvestigation?.id || '');
  const [monitoringConfig, setMonitoringConfig] = useState<MonitoringConfig | null>(null);
  const [isSavingPref, setIsSavingPref] = useState<boolean>(false);
  const [expandedDiffId, setExpandedDiffId] = useState<string | null>(null);

  useEffect(() => {
    if (currentInvestigation) setRerunTargetId(currentInvestigation.id);
  }, [currentInvestigation?.id]);

  const rerunTarget = allInvestigations.find((item) => item.id === rerunTargetId) || null;
  const baselineInvestigation = allInvestigations.find((item) => item.id === selectedBaselineId) || null;
  const latestInvestigation = allInvestigations.find((item) => item.id === selectedLatestId) || null;
  const comparisonSelectionError = validateInvestigationComparison(baselineInvestigation, latestInvestigation)?.message || null;

  // Preserve a deliberate selection from a vendor profile; otherwise initialize
  // an unconfigured comparison once data is available without resetting edits.
  useEffect(() => {
    if (comparisonSelection) {
      setSelectedBaselineId(comparisonSelection.baselineId);
      setSelectedLatestId(comparisonSelection.latestId);
    } else if (!selectedBaselineId && !selectedLatestId && allInvestigations.length >= 2) {
      setSelectedBaselineId(allInvestigations[1].id);
      setSelectedLatestId(allInvestigations[0].id);
    } else if (!selectedLatestId && allInvestigations.length === 1) {
      setSelectedLatestId(allInvestigations[0].id);
    }
  }, [allInvestigations, comparisonSelection?.baselineId, comparisonSelection?.latestId, selectedBaselineId, selectedLatestId]);

  useEffect(() => {
    setComparisonError(null);
    if (!selectedBaselineId || !selectedLatestId) {
      setComparisonReport(null);
      return;
    }
    const savedComparison = loadWorkspace().comparisons.find((item) =>
      item.previousInvestigationId === selectedBaselineId && item.latestInvestigationId === selectedLatestId
    );
    setComparisonReport(savedComparison || null);
  }, [selectedBaselineId, selectedLatestId]);

  // Load monitoring configuration
  useEffect(() => {
    const vendorId = currentInvestigation?.id || 'ven_default';
    fetch(`/api/monitoring/config/${vendorId}`)
      .then((res) => res.json())
      .then((data: MonitoringConfig) => setMonitoringConfig(loadWorkspace().monitoringConfigs[vendorId] || data))
      .catch((err) => console.error('Failed to load monitoring config:', err));
  }, [currentInvestigation?.id]);

  useEffect(() => {
    const saved = loadWorkspace();
    const vendorId = currentInvestigation?.id || 'ven_default';
    if (saved.monitoringConfigs[vendorId]) setMonitoringConfig(saved.monitoringConfigs[vendorId]);
    const selections = saved.preferences.monitoringSelection as { baselineId?: string; latestId?: string } | undefined;
    if (!comparisonSelection) {
      if (selections?.baselineId) setSelectedBaselineId(selections.baselineId);
      if (selections?.latestId) setSelectedLatestId(selections.latestId);
    }
  }, [currentInvestigation?.id, comparisonSelection?.baselineId, comparisonSelection?.latestId]);

  useEffect(() => {
    if (!selectedBaselineId && !selectedLatestId) return;
    updateWorkspace((saved) => ({ ...saved, preferences: { ...saved.preferences, monitoringSelection: { baselineId: selectedBaselineId, latestId: selectedLatestId } } }));
  }, [selectedBaselineId, selectedLatestId]);

  // Handle Manual "Re-run Investigation"
  const handleTriggerReRun = async () => {
    if (!rerunTarget?.id) return;
    setIsReRunning(true);
    try {
      const res = await fetch(`/api/investigations/${rerunTarget.id}/rerun`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useMock: isDemoMode, baseline: rerunTarget }),
      });

      if (res.ok) {
        const data = await res.json();
        setComparisonReport(data.comparison);
        if (data.comparison) updateWorkspace((saved) => ({ ...saved, comparisons: [data.comparison, ...saved.comparisons.filter((item) => item.comparisonId !== data.comparison.comparisonId)] }));
        if (onInvestigationUpdated && data.investigation) {
          setSelectedBaselineId(rerunTarget.id);
          setSelectedLatestId(data.investigation.id);
          onInvestigationUpdated(data.investigation);
        }
      } else {
        const err = await res.json();
        alert(`Re-run failed: ${err.error || 'Server error'}`);
      }
    } catch (e: any) {
      console.error('Re-run request error:', e);
      alert(`Network error during re-run: ${e.message}`);
    } finally {
      setIsReRunning(false);
    }
  };

  // Handle Comparing two selected investigations
  const handleRunComparison = async () => {
    setComparisonError(null);
    if (comparisonSelectionError || !baselineInvestigation || !latestInvestigation) {
      setComparisonError(comparisonSelectionError || 'Choose two valid investigation reports.');
      return;
    }
    setComparisonReport(null);
    setIsComparing(true);
    try {
      const res = await fetch('/api/monitoring/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previousInvestigationId: selectedBaselineId,
          latestInvestigationId: selectedLatestId,
          previousInvestigation: baselineInvestigation,
          latestInvestigation,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Comparison failed (HTTP ${res.status}).`);
      if (!data.comparisonId || !data.stats || !Array.isArray(data.newSignals)) {
        throw new Error('The comparison service returned an incomplete result. No result was saved.');
      }
      setComparisonReport(data);
      updateWorkspace((saved) => ({ ...saved, comparisons: [data, ...saved.comparisons.filter((item) => item.comparisonId !== data.comparisonId)] }));
    } catch (e) {
      setComparisonError(e instanceof Error ? e.message : 'Signal comparison failed. Please retry.');
    } finally {
      setIsComparing(false);
    }
  };

  // Handle Frequency Preference Change
  const handlePreferenceChange = async (pref: MonitoringFrequencyPreference) => {
    const vendorId = currentInvestigation?.id || 'ven_default';
    setIsSavingPref(true);
    try {
      const res = await fetch(`/api/monitoring/config/${vendorId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preference: pref }),
      });
      const current = monitoringConfig || { vendorId, preference: pref, status: 'SCHEDULING_NOT_ENABLED_IN_THIS_DEPLOYMENT' as const, lastCheckedAt: null, nextScheduledCheck: null, notice: 'Scheduling is not enabled; this preference is saved for future automation.' };
      const localConfig = { ...current, vendorId, preference: pref };
      updateWorkspace((saved) => ({ ...saved, monitoringConfigs: { ...saved.monitoringConfigs, [vendorId]: localConfig } }));
      setMonitoringConfig(localConfig);
      if (res.ok) {
        const updated = await res.json();
        setMonitoringConfig(updated);
      }
    } catch (e) {
      console.error('Failed to update monitoring config:', e);
    } finally {
      setIsSavingPref(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Re-Run Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#EAE6DF]">
        <div>
          <h2 className="text-lg font-bold text-[#1C1F26] flex items-center gap-2">
            <GitCompareArrows className="w-5 h-5 text-[#1C1F26]" />
            Continuous Monitoring & Signal Delta Engine
          </h2>
          <p className="mt-0.5 text-xs text-[#5F6572]">
            Execute manual re-checks, track deterministic signal delta across runs, and review source modifications.
          </p>
        </div>

        {allInvestigations.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <label className="space-y-1 text-[10px] font-semibold text-[#5F6572]">
              <span>Investigation to re-run</span>
              <select
                aria-label="Investigation to re-run"
                value={rerunTargetId}
                onChange={(event) => setRerunTargetId(event.target.value)}
                className="block min-w-[260px] max-w-[380px] min-h-11 rounded-lg border border-[#D5CEC2] bg-white px-3 py-2.5 text-sm text-[#1C1F26] shadow-sm focus:border-[#8A91A0] focus:outline-none focus:ring-2 focus:ring-[#EAE6DF]"
              >
                {allInvestigations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.targetName} · {item.identifierValue || item.identifierType} · {new Date(item.createdAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleTriggerReRun}
              disabled={isReRunning || !rerunTarget}
              className={`min-h-11 min-w-[168px] whitespace-nowrap px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-colors ${
                isReRunning || !rerunTarget
                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-[#1C1F26] text-white hover:bg-[#2D323E]'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isReRunning ? 'animate-spin' : ''}`} />
              {isReRunning ? 'Re-running…' : 'Re-run investigation'}
            </button>
          </div>
        )}
      </div>

      {/* Honest Scheduling Notice Card */}
      <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-lg flex items-start gap-3 text-xs">
        <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-amber-950">
              Deployment Scheduling Policy
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900">
              SCHEDULING NOT ENABLED IN THIS DEPLOYMENT
            </span>
          </div>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            In compliance with zero-fabrication standards: Background automated cron schedulers are inactive. All monitoring re-checks are executed manually via the button above to ensure authentic source queries and verifiable audit timestamps.
          </p>
        </div>
      </div>

      {/* Monitoring Frequency Preference Selector */}
      <Card header="Monitoring Frequency Preference (Saved for Future Automation)">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
          <div>
            <span className="font-semibold text-[#1C1F26] block">
              Desired Target Frequency
            </span>
            <p className="text-[11px] text-[#5F6572]">
              Configures future automated scheduling triggers once external runner infrastructure is active.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#F4F1EA] p-1.5">
            {(['MANUAL_ONLY', 'DAILY', 'WEEKLY', 'MONTHLY'] as MonitoringFrequencyPreference[]).map((pref) => (
              <button
                key={pref}
                type="button"
                onClick={() => handlePreferenceChange(pref)}
                disabled={isSavingPref}
                className={`min-h-10 min-w-[88px] px-4 py-2 rounded-lg text-xs font-semibold border cursor-pointer transition-all ${
                  monitoringConfig?.preference === pref
                  ? 'bg-[#1C1F26] text-white border-[#1C1F26] shadow-sm'
                    : 'bg-white text-[#5F6572] border-transparent hover:border-[#D5CEC2] hover:text-[#1C1F26]'
                }`}
              >
                {pref.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Historical Comparator Controls */}
      {allInvestigations.length >= 2 && (
        <Card header="Historical Report Delta Comparator">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1C1F26] mb-1">
                Baseline Investigation (Earlier)
              </label>
              <select
                value={selectedBaselineId}
                onChange={(e) => setSelectedBaselineId(e.target.value)}
                aria-label="Baseline investigation run"
                className="w-full min-h-12 px-4 py-3 text-sm bg-white border border-[#D5CEC2] rounded-lg text-[#1C1F26] shadow-sm focus:outline-none focus:border-[#1C1F26] focus:ring-2 focus:ring-[#EAE6DF]"
              >
                <option value="">Select baseline run...</option>
                {allInvestigations.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.targetName} ({new Date(inv.createdAt).toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1C1F26] mb-1">
                Latest Investigation (Current)
              </label>
              <select
                value={selectedLatestId}
                onChange={(e) => setSelectedLatestId(e.target.value)}
                aria-label="Latest investigation run"
                className="w-full min-h-12 px-4 py-3 text-sm bg-white border border-[#D5CEC2] rounded-lg text-[#1C1F26] shadow-sm focus:outline-none focus:border-[#1C1F26] focus:ring-2 focus:ring-[#EAE6DF]"
              >
                <option value="">Select comparison run...</option>
                {allInvestigations.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.targetName} ({new Date(inv.createdAt).toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleRunComparison}
              disabled={isComparing || Boolean(comparisonSelectionError)}
              aria-busy={isComparing}
              title={comparisonSelectionError || undefined}
              className="min-h-11 min-w-[190px] px-5 py-2.5 bg-[#1C1F26] text-white rounded-lg text-sm font-semibold hover:bg-[#2D323E] shadow-sm cursor-pointer flex items-center justify-center gap-2 transition-colors disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              <GitCompareArrows className={`w-3.5 h-3.5 ${isComparing ? 'animate-pulse' : ''}`} />
              {isComparing ? 'Computing delta…' : 'Compute Signal Delta'}
            </button>
          </div>
          {(comparisonSelectionError || comparisonError) && (
            <p role="alert" className="mt-2 text-right text-xs font-medium text-rose-700">
              {comparisonError || comparisonSelectionError}
            </p>
          )}
        </Card>
      )}

      {/* Comparison Report Display */}
      {comparisonReport ? (
        <div className="space-y-4">
          {/* Summary Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-lg">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
                New Signals
              </span>
              <span className="text-xl font-bold text-blue-950">
                {comparisonReport.stats.totalNew}
              </span>
              <span className="text-[10px] text-blue-800 block mt-0.5">
                Fresh findings detected
              </span>
            </div>

            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">
                Modified Signals
              </span>
              <span className="text-xl font-bold text-amber-950">
                {comparisonReport.stats.totalChanged}
              </span>
              <span className="text-[10px] text-amber-800 block mt-0.5">
                Stage or severity changes
              </span>
            </div>

            <div className="p-3 bg-slate-100/90 border border-slate-300 rounded-lg">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 block">
                Not Observed in Latest
              </span>
              <span className="text-xl font-bold text-slate-900">
                {comparisonReport.stats.totalNotObserved}
              </span>
              <span className="text-[10px] text-slate-600 block mt-0.5">
                Not verified as cleared
              </span>
            </div>

            <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-lg">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 block">
                Human Review Needed
              </span>
              <span className="text-xl font-bold text-purple-950">
                {comparisonReport.stats.totalUnresolved}
              </span>
              <span className="text-[10px] text-purple-800 block mt-0.5">
                Elevated priority diffs
              </span>
            </div>
          </div>

          {/* Overall Narrative Summary */}
          <div className="p-3 bg-white border border-[#D5CEC2] rounded-lg text-xs space-y-1">
            <span className="font-bold text-[#1C1F26]">Comparison complete:</span>
            <p className="text-[11px] text-[#5F6572]">
              {baselineInvestigation?.targetName || comparisonReport.vendorName} · {new Date(comparisonReport.previousRunDate).toLocaleString()} → {latestInvestigation?.targetName || comparisonReport.vendorName} · {new Date(comparisonReport.latestRunDate).toLocaleString()}
            </p>
            <span className="font-bold text-[#1C1F26]">Delta Assessment:</span>
            <p className="text-[#5F6572] leading-relaxed">{comparisonReport.summary}</p>
          </div>

          {/* Section 1: New Signals */}
          {comparisonReport.newSignals.length > 0 && (
            <Card
              header={`New Signals Detected (${comparisonReport.newSignals.length})`}
              headerAction={
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                  New since previous check
                </span>
              }
            >
              <div className="divide-y divide-[#EAE6DF]">
                {comparisonReport.newSignals.map((sig) => (
                  <div key={sig.id} className="py-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[#1C1F26]">{sig.title}</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
                          {sig.dimension.replace('_', ' ')}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-blue-700">
                        {sig.statusBadge}
                      </span>
                    </div>
                    <p className="text-xs text-[#5F6572]">{sig.explanation}</p>
                    {sig.currentSignal?.evidence[0]?.url && (
                      <a
                        href={sig.currentSignal.evidence[0].url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline font-semibold"
                      >
                        Review Source Evidence <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Section 2: Changed Signals */}
          {comparisonReport.changedSignals.length > 0 && (
            <Card
              header={`Modified Signals (${comparisonReport.changedSignals.length})`}
              headerAction={
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                  Status or Stage Changed
                </span>
              }
            >
              <div className="divide-y divide-[#EAE6DF]">
                {comparisonReport.changedSignals.map((sig) => {
                  const isExpanded = expandedDiffId === sig.id;
                  const isResolved = sig.diffType === 'RESOLVED_BY_SOURCE';

                  return (
                    <div key={sig.id} className="py-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-[#1C1F26]">{sig.title}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              isResolved
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {sig.statusBadge}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedDiffId(isExpanded ? null : sig.id)}
                          className="text-[11px] font-semibold text-[#5F6572] hover:text-[#1C1F26] flex items-center gap-1 cursor-pointer"
                        >
                          {isExpanded ? 'Hide Field Diff' : 'View Field Diff'}
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </div>

                      <p className="text-xs text-[#5F6572]">{sig.explanation}</p>

                      {/* Field-by-Field Diff Comparison */}
                      {isExpanded && (
                        <div className="bg-[#FAF8F5] p-3 rounded border border-[#EAE6DF] space-y-2 text-xs">
                          <span className="text-[11px] font-bold text-[#1C1F26] block">
                            Field-by-Field Attribute Diff:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {sig.changes.map((change, idx) => (
                              <div key={idx} className="bg-white p-2 rounded border border-[#D5CEC2]">
                                <span className="font-semibold text-[#5F6572] uppercase text-[10px] block">
                                  {change.field}
                                </span>
                                <div className="mt-1 flex items-center gap-2 text-xs">
                                  <span className="line-through text-red-600 font-mono">
                                    {String(change.previousValue)}
                                  </span>
                                  <ArrowRight className="w-3 h-3 text-[#8A91A0]" />
                                  <span className="text-emerald-700 font-bold font-mono">
                                    {String(change.currentValue)}
                                  </span>
                                </div>
                                {change.currentEvidenceDate && (
                                  <span className="text-[10px] text-[#8A91A0] block mt-1">
                                    Evidence Date: {new Date(change.currentEvidenceDate).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Section 3: Signals Not Observed in Latest Check (Zero-Fabrication Guard) */}
          {comparisonReport.notObservedSignals.length > 0 && (
            <Card
              header={`Records Not Observed in Latest Check (${comparisonReport.notObservedSignals.length})`}
              headerAction={
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800">
                  Not Verified as Cleared
                </span>
              }
            >
              <div className="divide-y divide-[#EAE6DF]">
                {comparisonReport.notObservedSignals.map((sig) => (
                  <div key={sig.id} className="py-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-[#1C1F26]">{sig.title}</span>
                      <span className="text-[11px] font-bold text-slate-600">
                        {sig.statusBadge}
                      </span>
                    </div>
                    <p className="text-xs text-[#5F6572] leading-relaxed">
                      {sig.explanation}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Empty Delta State */}
          {comparisonReport.stats.isIdentical && (
            <EmptyState
              icon={<CheckCircle2 className="w-6 h-6 text-emerald-600" />}
              title="Zero Delta Detected Across Investigation Runs"
              description="All normalized signals, court records, and debarment checks match baseline records identically. No new risk signals or status modifications observed."
            />
          )}
        </div>
      ) : (
        <EmptyState
          icon={<GitCompareArrows className="w-6 h-6 text-[#5F6572]" />}
          title="No Comparison Computed Yet"
          description="Click 'Re-run Investigation' above or select two past investigation runs to inspect verified changes, procedural resolutions, and newly surfaced signals."
        />
      )}
    </div>
  );
};
