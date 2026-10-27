import React, { useState } from 'react';
import { Investigation } from '../../types/vendor.js';
import { getAssessmentDisplayValues } from '../../utils/assessmentDisplay.js';
import { VendorTraceAssessmentReport, ReviewPriority, CoverageStatus } from '../../types/crossValidation.js';
import { Badge } from '../common/Badge.js';
import { Card } from '../common/Card.js';
import { EmptyState } from '../common/EmptyState.js';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  FileText,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Building2,
  Scale,
  Newspaper,
  Layers,
  HelpCircle,
  XCircle,
  Info,
  Calendar,
  Download,
} from 'lucide-react';

interface InvestigationSummaryProps {
  investigation: Investigation | null;
}

export const InvestigationSummary: React.FC<InvestigationSummaryProps> = ({
  investigation,
}) => {
  const [isScoreExpanded, setIsScoreExpanded] = useState(false);
  const [isReviewQueueExpanded, setIsReviewQueueExpanded] = useState(true);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  const handleExportPdf = async () => {
    if (!investigation) return;
    setIsExportingPdf(true);
    try {
      const res = await fetch(`/api/reports/${investigation.id}/export/pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ investigation }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Export failed: ${err.error || 'Server error'}`);
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VendorTrace_${investigation.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Download error: ${err.message}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportCsv = async () => {
    if (!investigation) return;
    setIsExportingCsv(true);
    try {
      const res = await fetch(`/api/reports/${investigation.id}/export/csv`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ investigation }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Export failed: ${err.error || 'Server error'}`);
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VendorTrace_Evidence_${investigation.id}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Download error: ${err.message}`);
    } finally {
      setIsExportingCsv(false);
    }
  };

  if (!investigation) {
    return (
      <Card header="Executive Due Diligence Report">
        <EmptyState
          icon={<FileText className="w-5 h-5" />}
          title="No investigation loaded"
          description="Enter an Indian corporate identifier (CIN, GSTIN, PAN, or DIN) above and execute an investigation to view the verified evidence-first due diligence report."
        />
      </Card>
    );
  }

  const assessment = investigation.assessmentReport;
  const assessmentValues = getAssessmentDisplayValues(assessment);
  const { findingsCount, sourcesChecked } = investigation;

  const getPriorityBadge = (priority?: ReviewPriority) => {
    switch (priority) {
      case 'ELEVATED_REVIEW_PRIORITY':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-800 border border-rose-300 shadow-xs">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
            Elevated Review Priority
          </span>
        );
      case 'REVIEW_RECOMMENDED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 shadow-xs">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Review Recommended
          </span>
        );
      case 'INSUFFICIENT_COVERAGE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300 shadow-xs">
            <HelpCircle className="w-3.5 h-3.5 text-slate-600" />
            Insufficient Coverage
          </span>
        );
      case 'LIMITED_EVIDENCE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200 shadow-xs">
            <Info className="w-3.5 h-3.5 text-purple-600" />
            Limited Evidence (Identity Ambiguous)
          </span>
        );
      case 'STANDARD_PERIODIC_REVIEW':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Standard Periodic Review
          </span>
        );
      default:
        return <span className="px-3 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">Not Calculated</span>;
    }
  };

  const getCoverageBadge = (status?: CoverageStatus) => {
    switch (status) {
      case 'COMPLETE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            Coverage: Complete (4/4 Dimensions)
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-300">
            Coverage: Partial (Gaps Marked)
          </span>
        );
      case 'INADEQUATE':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">
            Coverage: Inadequate (Essential Gaps)
          </span>
        );
    }
  };

  const getDimensionStatusBadge = (status: string) => {
    switch (status) {
      case 'signal_found':
        return <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-amber-50 text-amber-800 border border-amber-200">Signal Found</span>;
      case 'no_signal_found_in_checked_sources':
        return <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-emerald-50 text-emerald-800 border border-emerald-200">No Signal Found</span>;
      case 'no_data_available':
        return <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-slate-100 text-slate-700 border border-slate-200">No Data Available</span>;
      case 'source_unavailable':
        return <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-rose-50 text-rose-800 border border-rose-200">Source Unavailable</span>;
      case 'no_matching_entity_identified':
      default:
        return <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-purple-50 text-purple-700 border border-purple-200">No Matching Entity</span>;
    }
  };

  const dimensionCards = assessment?.fourDimensionCards;

  return (
    <div className="space-y-5">
      {/* 1. Stale Report Notice if investigation older than 30 days */}
      {assessment?.isStale && (
        <div className="p-3 bg-amber-50/80 border border-amber-300 rounded text-xs flex items-center justify-between text-amber-950">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <strong>Stale Report Notice: </strong>
              {assessment.staleNotice}
            </span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-amber-300">
            Re-run Suggested
          </span>
        </div>
      )}

      {/* 2. Vendor Identity Header & Match Status */}
      <div className="bg-white border border-[#EAE6DF] rounded-lg p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-[#1C1F26] tracking-tight">
              {investigation.targetName}
            </h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[#1C1F26] font-medium">
              {investigation.identifierType}: {investigation.identifierValue || 'Not Provided'}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800">
              Match Quality: {assessment?.identityMatchQuality || 'EXACT_IDENTIFIER'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-[#5F6572] flex-wrap">
            <span>Report ID: <span className="font-mono text-[#1C1F26] font-medium">{investigation.id}</span></span>
            <span>·</span>
            <span>Completed: <span className="text-[#1C1F26]">{new Date(investigation.createdAt).toLocaleString()}</span></span>
            <span>·</span>
            <span>Initiated by: {investigation.requestedBy}</span>
            <span>·</span>
            <span>Execution mode: {investigation.executionMode === 'DEMO' ? 'Demo' : investigation.executionMode === 'LIVE' ? 'Live' : 'Not recorded'}</span>
            {investigation.providerLabels?.length ? <><span>·</span><span>Providers: {investigation.providerLabels.join(', ')}</span></> : null}
          </div>
        </div>

        {/* Review Priority & Coverage Badge + Export Actions */}
        <div className="flex w-full flex-col items-start gap-2 lg:w-max lg:items-end">
          <div className="flex flex-wrap items-center gap-2 lg:w-full lg:justify-end">
            {getPriorityBadge(assessmentValues.priority ?? undefined)}
            {getCoverageBadge(assessment?.coverageStatus)}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1 lg:w-full lg:justify-end">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="px-2.5 py-1.5 bg-white border border-[#D5CEC2] rounded text-[11px] font-semibold text-[#1C1F26] hover:bg-[#FAF8F5] cursor-pointer flex items-center gap-1.5 shadow-xs"
              title="Download formal due diligence PDF report"
            >
              <Download className={`w-3.5 h-3.5 ${isExportingPdf ? 'animate-spin' : ''}`} />
              {isExportingPdf ? 'Exporting PDF...' : 'Export PDF'}
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={isExportingCsv}
              className="px-2.5 py-1.5 bg-white border border-[#D5CEC2] rounded text-[11px] font-semibold text-[#1C1F26] hover:bg-[#FAF8F5] cursor-pointer flex items-center gap-1.5 shadow-xs"
              title="Download RFC 4180 CSV evidence register"
            >
              <Download className={`w-3.5 h-3.5 ${isExportingCsv ? 'animate-spin' : ''}`} />
              {isExportingCsv ? 'Exporting CSV...' : 'CSV Register'}
            </button>
          </div>
        </div>
      </div>

      {/* 3. Overall Review Priority with Score Explanation & Factor Contributions */}
      {assessment?.scoreBreakdown ? (
        <div className="bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#1C1F26] uppercase tracking-wide">
                Explainable Risk Index & Rule Explanation
              </span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-white border border-[#EAE6DF] text-[#1C1F26]">
                Score: {assessment.scoreBreakdown.totalScore} / 100
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsScoreExpanded(!isScoreExpanded)}
              className="text-xs text-[#1C1F26] hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <span>{isScoreExpanded ? 'Hide Factor Breakdown' : 'View Factor Breakdown'}</span>
              {isScoreExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          <p className="text-xs text-[#1C1F26] font-medium leading-relaxed">
            {assessment.scoreBreakdown.ruleApplied}
          </p>

          {/* Expandable Factor Contribution Table */}
          {isScoreExpanded && (
            <div className="pt-3 border-t border-[#EAE6DF] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-white border border-[#EAE6DF] rounded space-y-1">
                <div className="flex items-center justify-between text-[#5F6572]">
                  <span className="font-semibold">Severity Weight</span>
                  <span className="font-mono text-[#1C1F26] font-bold">{assessment.scoreBreakdown.severityPoints}/40 pts</span>
                </div>
                <p className="text-[11px] text-[#5F6572] leading-snug">{assessment.scoreBreakdown.severityRationale}</p>
              </div>

              <div className="p-3 bg-white border border-[#EAE6DF] rounded space-y-1">
                <div className="flex items-center justify-between text-[#5F6572]">
                  <span className="font-semibold">Evidence Confidence</span>
                  <span className="font-mono text-[#1C1F26] font-bold">{assessment.scoreBreakdown.confidencePoints}/30 pts</span>
                </div>
                <p className="text-[11px] text-[#5F6572] leading-snug">{assessment.scoreBreakdown.confidenceRationale}</p>
              </div>

              <div className="p-3 bg-white border border-[#EAE6DF] rounded space-y-1">
                <div className="flex items-center justify-between text-[#5F6572]">
                  <span className="font-semibold">Signal Recency</span>
                  <span className="font-mono text-[#1C1F26] font-bold">{assessment.scoreBreakdown.recencyPoints}/15 pts</span>
                </div>
                <p className="text-[11px] text-[#5F6572] leading-snug">{assessment.scoreBreakdown.recencyRationale}</p>
              </div>

              <div className="p-3 bg-white border border-[#EAE6DF] rounded space-y-1">
                <div className="flex items-center justify-between text-[#5F6572]">
                  <span className="font-semibold">Identity Match Quality</span>
                  <span className="font-mono text-[#1C1F26] font-bold">{assessment.scoreBreakdown.identityMatchPoints}/15 pts</span>
                </div>
                <p className="text-[11px] text-[#5F6572] leading-snug">{assessment.scoreBreakdown.identityMatchRationale}</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg p-4 text-xs text-[#5F6572]">
          Explainable Risk Score: {assessmentValues.riskScore === null ? 'Not Calculated' : `${assessmentValues.riskScore} / 100`}
        </div>
      )}

      {/* 4. Executive Brief Summary with Exact Evidence Citations */}
      {assessment?.briefSummary && (
        <div className="p-4 bg-white border border-[#EAE6DF] rounded-lg shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#1C1F26] uppercase tracking-wide flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#1C1F26]" />
              Executive Diligence Summary (With Evidence Citations)
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[#5F6572]">
              {assessment.briefSummary.generatedBy === 'GEMINI_ASSISTED' ? 'AI-Assisted Citation Summary' : 'Deterministic Rule Summary'}
            </span>
          </div>

          <p className="text-xs text-[#1C1F26] leading-relaxed">
            {assessment.briefSummary.text}
          </p>

          <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[10px] text-[#5F6572]">
            <span>Cited Evidence Ledger:</span>
            {assessment.briefSummary.citedEvidenceIds.map((id, idx) => (
              <span key={idx} className="font-mono px-1.5 py-0.5 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[#1C1F26] font-medium">
                [{id}]
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 5. Four Core Dimension Cards */}
      {dimensionCards && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-[#8A91A0] uppercase tracking-wider">
            Four Core Risk Dimension Cards
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1: Registry / GST */}
            <div className="p-4 bg-white border border-[#EAE6DF] rounded-lg shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[#1C1F26]">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#1C1F26]">{dimensionCards.registry_gst.title}</h4>
                    <span className="text-[10px] text-[#8A91A0] font-mono">Count: {dimensionCards.registry_gst.count} finding(s)</span>
                  </div>
                </div>
                {getDimensionStatusBadge(dimensionCards.registry_gst.status)}
              </div>
              <p className="text-xs text-[#5F6572] leading-relaxed">
                {dimensionCards.registry_gst.neutralSummary}
              </p>
              {dimensionCards.registry_gst.coverageGaps.length > 0 && (
                <div className="p-2 bg-amber-50 text-amber-900 rounded text-[10px] border border-amber-200">
                  Coverage Gap: {dimensionCards.registry_gst.coverageGaps.join(', ')}
                </div>
              )}
            </div>

            {/* Card 2: Court / Litigation */}
            <div className="p-4 bg-white border border-[#EAE6DF] rounded-lg shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[#1C1F26]">
                    <Scale className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#1C1F26]">{dimensionCards.court_litigation.title}</h4>
                    <span className="text-[10px] text-[#8A91A0] font-mono">Count: {dimensionCards.court_litigation.count} finding(s)</span>
                  </div>
                </div>
                {getDimensionStatusBadge(dimensionCards.court_litigation.status)}
              </div>
              <p className="text-xs text-[#5F6572] leading-relaxed">
                {dimensionCards.court_litigation.neutralSummary}
              </p>
              {dimensionCards.court_litigation.coverageGaps.length > 0 && (
                <div className="p-2 bg-amber-50 text-amber-900 rounded text-[10px] border border-amber-200">
                  Coverage Gap: {dimensionCards.court_litigation.coverageGaps.join(', ')}
                </div>
              )}
            </div>

            {/* Card 3: Blacklist / Debarment */}
            <div className="p-4 bg-white border border-[#EAE6DF] rounded-lg shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[#1C1F26]">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#1C1F26]">{dimensionCards.blacklist_debarment.title}</h4>
                    <span className="text-[10px] text-[#8A91A0] font-mono">Count: {dimensionCards.blacklist_debarment.count} finding(s)</span>
                  </div>
                </div>
                {getDimensionStatusBadge(dimensionCards.blacklist_debarment.status)}
              </div>
              <p className="text-xs text-[#5F6572] leading-relaxed">
                {dimensionCards.blacklist_debarment.neutralSummary}
              </p>
              {dimensionCards.blacklist_debarment.coverageGaps.length > 0 && (
                <div className="p-2 bg-amber-50 text-amber-900 rounded text-[10px] border border-amber-200">
                  Coverage Gap: {dimensionCards.blacklist_debarment.coverageGaps.join(', ')}
                </div>
              )}
            </div>

            {/* Card 4: Negative News & Media */}
            <div className="p-4 bg-white border border-[#EAE6DF] rounded-lg shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[#1C1F26]">
                    <Newspaper className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#1C1F26]">{dimensionCards.negative_news.title}</h4>
                    <span className="text-[10px] text-[#8A91A0] font-mono">Count: {dimensionCards.negative_news.count} finding(s)</span>
                  </div>
                </div>
                {getDimensionStatusBadge(dimensionCards.negative_news.status)}
              </div>
              <p className="text-xs text-[#5F6572] leading-relaxed">
                {dimensionCards.negative_news.neutralSummary}
              </p>
              {dimensionCards.negative_news.coverageGaps.length > 0 && (
                <div className="p-2 bg-amber-50 text-amber-900 rounded text-[10px] border border-amber-200">
                  Coverage Gap: {dimensionCards.negative_news.coverageGaps.join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. "Needs Human Review" Queue */}
      {assessment?.humanReviewQueue && assessment.humanReviewQueue.length > 0 && (
        <div className="bg-white border border-amber-300 rounded-lg shadow-xs overflow-hidden">
          <div className="p-3.5 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              <span className="text-xs font-bold uppercase tracking-wider">
                Needs Human Review Queue ({assessment.humanReviewQueue.length} Matters)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsReviewQueueExpanded(!isReviewQueueExpanded)}
              className="text-xs text-amber-900 hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <span>{isReviewQueueExpanded ? 'Collapse' : 'Expand'}</span>
              {isReviewQueueExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {isReviewQueueExpanded && (
            <div className="divide-y divide-[#EAE6DF]">
              {assessment.humanReviewQueue.map((item) => (
                <div key={item.id} className="p-3.5 space-y-1.5 text-xs hover:bg-[#FAF8F5]/50">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#1C1F26]">{item.title}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                      {item.confidence.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#5F6572] leading-relaxed">
                    {item.neutralSummary}
                  </p>
                  <div className="p-2 bg-[#FCFBF9] border border-[#EAE6DF] rounded text-[11px] text-[#1C1F26] font-medium">
                    Review Reason: <span className="text-amber-900 font-normal">{item.humanReviewReason || 'Single source claim requires officer verification.'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 7. Evaluated Sources Checklist */}
      <div className="p-3.5 bg-[#FCFBF9] border border-[#EAE6DF] rounded text-xs">
        <span className="font-semibold text-[#1C1F26] block mb-2">
          Checked Independent Audit Sources ({sourcesChecked.length})
        </span>
        <div className="flex flex-wrap gap-2">
          {sourcesChecked.map((src, idx) => (
            <span
              key={idx}
              className="px-2 py-1 bg-white border border-[#EAE6DF] rounded text-[11px] text-[#5F6572] flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
              <span>{src}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
