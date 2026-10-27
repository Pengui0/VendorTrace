/**
 * Normalized Risk Finding and Discovery Contracts for VendorTrace
 * Layer 1 Discovery Engine & Evidence Cross-Validation Architecture
 */

import { ProviderErrorCategory } from '../server/providers/types.js';

export type RiskDimension =
  | 'company_registry'
  | 'gst_compliance'
  | 'court_litigation'
  | 'blacklist_debarment'
  | 'negative_news';

export type FindingStatus =
  | 'signal_found'
  | 'no_signal_found_in_checked_sources'
  | 'inconclusive'
  | 'source_unavailable'
  | 'conflicting_evidence';

export type FindingConfidence =
  | 'multiple_independent_sources'
  | 'single_source_review'
  | 'conflicting_sources'
  | 'insufficient_evidence';

export type LegalDisputeStatus =
  | 'alleged'
  | 'pending'
  | 'dismissed'
  | 'disposed'
  | 'settled'
  | 'confirmed'
  | 'unknown'
  | null;

export type DimensionTaskState =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'unavailable'
  | 'cancelled';

export interface EvidenceItem {
  sourceTitle?: string;
  publisher?: string;
  searchResultUrl?: string;
  sourceFetchError?: string;
  id?: string;
  sourceName: string;
  sourceDomain: string;
  url: string | null;
  snippet: string; // Verbatim short snippet
  publishedAt: string | null; // ISO 8601
  capturedAt: string; // ISO 8601
  underlyingSource: string; // Specific document/filing provenance
  identityMatchNote: string; // Match confidence basis (e.g. "Exact 21-character CIN match")
  searchQuery?: string;
  expandedText?: string;
  caseId?: string;
  caseTitle?: string;
  caseNumber?: string;
  caseCourt?: string;
  casePetitioner?: string;
  caseRespondent?: string;
  caseParties?: string;
  caseMatchedParty?: string;
  caseStatus?: string;
  caseDate?: string;
  legalStatus?: LegalDisputeStatus;
  isPressReleaseRepetition?: boolean; // True if syndicated from PR wire
  syndicatedFromDomain?: string | null;
}

export interface RiskFinding {
  id: string; // Stable ID, e.g. "rf_1792857000_abc12"
  dimension: RiskDimension;
  title: string;
  neutralSummary: string;
  status: FindingStatus;
  severity: 1 | 2 | 3 | 4 | 5; // 1 = Info/Clear, 3 = Caution, 5 = Critical
  severityExplanation: string; // Short rule-based explanation
  evidence: EvidenceItem[];
  confidence: FindingConfidence;
  recommendedReviewAction: string; // Recommended review action, not a final legal conclusion
  missingDataReason?: string | null; // Explicit reason if any expected fields are null
  createdAt: string; // ISO 8601
}

export interface DimensionTaskResult {
  dimension: RiskDimension;
  title: string;
  status: DimensionTaskState;
  provider: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  attemptCount?: number;
  sourceCount: number;
  errorCategory: ProviderErrorCategory;
  errorMessage: string | null;
  findings: RiskFinding[];
  findingsCount?: number;
  sourcesChecked: string[];
  coverageGaps: string[];
  evidenceSearchOutcome?: 'MATCH_FOUND' | 'NO_MATCH_FOUND_IN_SEARCHED_SOURCES' | 'SOURCE_UNAVAILABLE';
  evidenceSearchQuery?: string;
  manualReviewRequired?: boolean;
}

export interface Layer1DiscoveryReport {
  investigationId: string;
  vendorId: string;
  vendorName: string;
  cin: string | null;
  gstin: string | null;
  pan: string | null;
  status: 'completed' | 'partial_failure' | 'failed' | 'cancelled';
  coverageStatus?: 'COMPLETE' | 'PARTIAL';
  terminationReason?: 'TIMEOUT' | 'CANCELLED' | null;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  dimensions: Record<RiskDimension, DimensionTaskResult>;
  findings: RiskFinding[];
  findingsCount?: number;
  sourcesChecked?: string[];
  coverageGaps: string[];
  totalSourcesChecked: number;
  summary: {
    totalSignals: number;
    corroboratedSignals: number;
    reviewNeededSignals: number;
    highSeveritySignals: number;
    verdict: 'VERIFIED_CLEAR' | 'CAUTION' | 'MATERIAL_RISK' | 'UNKNOWN';
    narrative: string;
  };
}

export interface DiscoveryOrchestrationOptions {
  maxConcurrency?: number; // Bounded concurrency (default: 3)
  overallTimeoutMs?: number; // Strict deadline (default: 120000ms)
  dimensionTimeoutMs?: number; // Per-agent timeout (default: 45000ms)
  maxAttempts?: number; // Total attempts, including the initial attempt (maximum: 2)
  retryBackoffMs?: number;
  signal?: AbortSignal;
  freshRun?: boolean;
  useMock?: boolean;
  mockScenario?: 'ALL_SUCCESS' | 'PARTIAL_FAILURE' | 'TIMEOUT' | 'DUPLICATE_EVIDENCE' | 'NO_RESULTS' | 'PARTIAL_FAILURE_DEBARMENT_FAIL' | string;
}
