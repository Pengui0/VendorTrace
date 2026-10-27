import React, { useState } from 'react';
import { Finding } from '../../types/vendor.js';
import { RiskFinding } from '../../types/riskFinding.js';
import { Badge } from '../common/Badge.js';
import { Card } from '../common/Card.js';
import { EmptyState } from '../common/EmptyState.js';
import {
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Clock,
  FileText,
  ChevronDown,
  ChevronUp,
  Layers,
  HelpCircle,
  AlertTriangle,
  Scale,
  Building,
  Newspaper,
  ShieldAlert,
} from 'lucide-react';

interface EvidenceListProps {
  findings: Finding[];
  normalizedFindings?: RiskFinding[];
  isLoading?: boolean;
  isPartial?: boolean;
  isStale?: boolean;
  coverageGaps?: string[];
}

export const EvidenceList: React.FC<EvidenceListProps> = ({
  findings,
  normalizedFindings = [],
  isLoading = false,
  isPartial = false,
  isStale = false,
  coverageGaps = [],
}) => {
  const [expandedChains, setExpandedChains] = useState<Record<string, boolean>>({});

  const toggleChain = (id: string) => {
    setExpandedChains((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // 1. Loading State
  if (isLoading) {
    return (
      <Card header="Findings & Cross-Validated Evidence Ledger">
        <div className="p-8 text-center space-y-3">
          <div className="w-8 h-8 mx-auto border-2 border-[#1C1F26] border-t-transparent rounded-full animate-spin" />
          <h4 className="text-sm font-bold text-[#1C1F26]">
            Compiling Cross-Validated Evidence Across 4 Dimensions...
          </h4>
          <p className="text-xs text-[#5F6572] max-w-md mx-auto">
            Resolving MCA21 filings, GST returns, e-court dockets, and public debarment rosters concurrently.
          </p>
        </div>
      </Card>
    );
  }

  // 2. Zero-Results State (Honest disclosure: No signal != clean)
  if (findings.length === 0) {
    return (
      <Card header="Findings & Cross-Validated Evidence Ledger">
        <EmptyState
          icon={<FileText className="w-5 h-5" />}
          title="No findings recorded in checked registries"
          description="Investigation returned zero adverse signals in the sources audited. VendorTrace Integrity Rule: 'No signal found in sources checked' does not constitute proof that a vendor is clean."
        />
        {coverageGaps.length > 0 && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 space-y-1">
            <strong>Identified Coverage Gaps:</strong>
            <ul className="list-disc list-inside text-[11px]">
              {coverageGaps.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    );
  }

  const getRiskBadge = (risk: Finding['riskLevel']) => {
    switch (risk) {
      case 'MATERIAL_RISK':
        return <Badge tone="risk" size="sm">Material Risk</Badge>;
      case 'CAUTION':
        return <Badge tone="caution" size="sm">Caution</Badge>;
      case 'VERIFIED_CLEAR':
        return <Badge tone="verified" size="sm">Checked Clear</Badge>;
      case 'UNKNOWN':
      default:
        return <Badge tone="neutral" size="sm">Status Unknown</Badge>;
    }
  };

  const getVerificationBadge = (status: Finding['verificationStatus']) => {
    switch (status) {
      case 'CORROBORATED':
        return <Badge tone="verified" size="sm">Corroborated (&ge;2 Sources)</Badge>;
      case 'REQUIRES_HUMAN_REVIEW':
        return <Badge tone="caution" size="sm">Requires Human Review (Single Source)</Badge>;
      case 'CONFLICTING_EVIDENCE':
        return <Badge tone="risk" size="sm">Conflicting Evidence</Badge>;
      case 'UNRESOLVED':
      default:
        return <Badge tone="neutral" size="sm">Unresolved</Badge>;
    }
  };

  const getLegalStatusBadge = (status?: string | null) => {
    if (!status) return null;
    const lower = status.toLowerCase();
    if (lower === 'alleged') {
      return (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-900">
          Allegation (Pending Adjudication)
        </span>
      );
    }
    if (lower === 'dismissed' || lower === 'disposed' || lower === 'settled') {
      return (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-900">
          Status: {status.toUpperCase()}
        </span>
      );
    }
    if (lower === 'confirmed') {
      return (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-50 border border-rose-300 text-rose-900">
          Status: CONFIRMED ORDER
        </span>
      );
    }
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-800">
        Status: {status.toUpperCase()}
      </span>
    );
  };

  return (
    <Card
      header="Findings & Cross-Validated Evidence Ledger"
      headerAction={
        <div className="flex items-center gap-3 text-[11px] text-[#5F6572]">
          <span>{findings.length} Finding{findings.length === 1 ? '' : 's'} Evaluated</span>
          {isPartial && (
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold border border-amber-300">
              Partial Report
            </span>
          )}
        </div>
      }
      noPadding
    >
      <div className="space-y-2.5 p-3">
        {findings.map((f, idx) => {
          const norm = normalizedFindings.find((nf) => nf.title === f.title || nf.id === f.id);
          const isExpanded = expandedChains[f.id] !== false; // Default expanded
          const legalStatus = norm?.evidence[0]?.legalStatus;

          return (
            <div
              key={f.id || idx}
              className="p-4 space-y-3 rounded-md border border-[#EAE6DF] bg-white shadow-2xs hover:bg-[#FAF8F5]/30 transition-colors"
            >
              {/* Finding Title Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#1C1F26]">{f.title}</span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[#5F6572]">
                    {f.category}
                  </span>
                  {getLegalStatusBadge(legalStatus)}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {getRiskBadge(f.riskLevel)}
                  {getVerificationBadge(f.verificationStatus)}
                </div>
              </div>

              {/* Core Claim Statement */}
              <p className="text-xs text-[#1C1F26] leading-relaxed font-medium">
                {f.claim}
              </p>

              {/* Compliance & Review Officer Note */}
              {f.notesForOfficer && (
                <div className="p-2.5 bg-[#FAF8F5] border-l-2 border-[#1C1F26] rounded-r text-[11px] text-[#5F6572] leading-relaxed">
                  <span className="font-semibold text-[#1C1F26]">Compliance Rationale: </span>
                  {f.notesForOfficer}
                </div>
              )}

              {/* Expandable Evidence Chain Section */}
              <div className="pt-1 space-y-2">
                <div className="flex items-center justify-between text-[10px]">
                  <button
                    type="button"
                    onClick={() => toggleChain(f.id)}
                    className="font-bold text-[#1C1F26] uppercase tracking-wider flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <span>Independent Evidence Chain ({f.sources.length} Sources)</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  <span className="text-[#8A91A0]">
                    Match Strength: <strong className="text-[#1C1F26]">{f.identityMatchStrength}</strong>
                  </span>
                </div>

                {isExpanded && (
                  <div className="space-y-2.5">
                    {f.sources.map((src, sIdx) => {
                      const normEv = norm?.evidence[sIdx];
                      const isWire = normEv?.isPressReleaseRepetition;

                      return (
                        <div
                          key={sIdx}
                          className="p-3 bg-[#FCFBF9] border border-[#EAE6DF] rounded text-xs space-y-2 shadow-2xs"
                        >
                          {/* Source Header */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-[#1C1F26]">
                                {src.sourceTitle || src.sourceName}
                              </span>
                              <span className="text-[10px] font-mono text-[#8A91A0]">
                                ({src.publisher || src.sourceDomain})
                              </span>
                              {isWire && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200">
                                  Syndicated Wire Copy
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3 text-[10px] text-[#8A91A0]">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {src.sourceFetchError ? 'Attempted ' : 'Retrieved '}{new Date(src.retrievedAt).toLocaleString()}
                              </span>

                              {src.url && (
                                <a
                                  href={src.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#1C1F26] hover:underline flex items-center gap-1 font-medium"
                                >
                                  <span>Inspect Source URL</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                              {!src.url && <span className="text-[#8A91A0]">No direct source URL supplied.</span>}
                              {src.searchResultUrl && (
                                <a href={src.searchResultUrl} target="_blank" rel="noopener noreferrer" className="text-amber-800 hover:underline flex items-center gap-1 font-medium">
                                  <span>Search result URL (source not fetched)</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Escaped Verbatim Snippet (XSS Protected) */}
                          {src.sourceFetchError ? (
                            <div className="text-[11px] text-amber-900 bg-amber-50 p-2.5 rounded border border-amber-200 leading-relaxed">
                              Source content was not retrieved: {src.sourceFetchError}. Identity and finding remain unverified.
                            </div>
                          ) : src.snippet ? (
                            <blockquote className="text-[11px] text-[#5F6572] italic bg-white p-2.5 rounded border border-[#EAE6DF]/70 leading-relaxed break-words">
                              &ldquo;{src.snippet.slice(0, 500)}&rdquo;
                            </blockquote>
                          ) : null}

                          {src.identityMatchNote && (
                            <div className="text-[10px] text-[#5F6572]">Identity match: {src.identityMatchNote}</div>
                          )}
                          {src.searchQuery && (
                            <details className="text-[10px] text-[#5F6572]">
                              <summary className="cursor-pointer font-semibold">Search query and source details</summary>
                              <p className="pt-1 break-words">{src.searchQuery}</p>
                            </details>
                          )}
                          {src.expandedText && src.expandedText.length > src.snippet.length && (
                            <details className="text-[10px] text-[#5F6572]">
                              <summary className="cursor-pointer font-semibold">Inspect more fetched text</summary>
                              <p className="pt-1 leading-relaxed">{src.expandedText.slice(0, 4000)}</p>
                            </details>
                          )}

                          {/* Provenance & Confidence Rationale */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[10px] text-[#8A91A0] pt-0.5">
                            <span>Provenance: <strong className="text-[#5F6572]">{src.provenance}</strong></span>
                            <span>Match Basis: <strong className="text-[#5F6572]">{src.matchConfidence}</strong></span>
                          </div>

                          {/* Explicit Confidence Rationale from Layer 3 Cross-Validation */}
                          {norm && (norm as any).confidenceRationale && (
                            <div className="text-[10px] text-emerald-900 bg-emerald-50/70 p-1.5 rounded border border-emerald-200 font-medium">
                              Cross-Validation Basis: {(norm as any).confidenceRationale}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
