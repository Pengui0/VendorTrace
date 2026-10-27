/**
 * Layer 3 Cross-Validation, Deterministic Scoring, and Assessment Contracts
 * Enforces Zero-Hallucination, Deterministic Risk Calculations, and Provenance Discipline.
 */

import {
  RiskFinding,
  EvidenceItem,
  FindingConfidence,
  FindingStatus,
  RiskDimension,
} from './riskFinding.js';

export type ReviewPriority =
  | 'ELEVATED_REVIEW_PRIORITY'
  | 'REVIEW_RECOMMENDED'
  | 'STANDARD_PERIODIC_REVIEW'
  | 'INSUFFICIENT_COVERAGE'
  | 'LIMITED_EVIDENCE';

export type CoverageStatus = 'COMPLETE' | 'PARTIAL' | 'INADEQUATE' | 'ADEQUATE';

export type IdentityMatchQuality = 'EXACT_IDENTIFIER' | 'STRONG_NAME_AND_ADDRESS' | 'PROBABLE' | 'WEAK' | 'NO_MATCHING_ENTITY';

export interface ScoreFactorBreakdown {
  severityPoints: number; // 0-40 points
  severityRationale: string;
  confidencePoints: number; // 0-30 points
  confidenceRationale: string;
  recencyPoints: number; // 0-15 points
  recencyRationale: string;
  identityMatchPoints: number; // 0-15 points
  identityMatchRationale: string;
  coveragePointsAdjustment: number; // Deductions if coverage is incomplete
  totalScore: number; // 0-100 deterministic risk index
  ruleApplied: string; // Plain-English deterministic rule explanation
}

export interface CrossValidatedFinding extends RiskFinding {
  confidenceRationale: string;
  sourcesCounted: string[];
  syndicatedOrExcludedSources: string[];
  needsHumanReview: boolean;
  humanReviewReason?: string;
}

export interface CoreDimensionCard {
  dimension: 'registry_gst' | 'court_litigation' | 'blacklist_debarment' | 'negative_news';
  title: string;
  status:
    | 'signal_found'
    | 'no_signal_found_in_checked_sources'
    | 'no_data_available'
    | 'source_unavailable'
    | 'no_matching_entity_identified';
  count: number;
  confidenceBadge: string;
  lastCheckedAt: string;
  coverageGaps: string[];
  neutralSummary: string;
  findings: CrossValidatedFinding[];
}

export interface VendorTraceAssessmentReport {
  investigationId: string;
  vendorId: string;
  vendorName: string;
  cin?: string | null;
  gstin?: string | null;
  pan?: string | null;
  identityMatchQuality?: IdentityMatchQuality;
  reviewPriority?: ReviewPriority;
  overallReviewPriority?: ReviewPriority; // Compatibility alias
  priorityHeadline?: string;
  coverageStatus: CoverageStatus;
  coverageGaps?: string[];
  scoreBreakdown?: ScoreFactorBreakdown;
  explainableRiskScore?: number; // Compatibility alias
  isStale?: boolean;
  staleNotice?: string;
  humanReviewQueue?: CrossValidatedFinding[];
  fourDimensionCards?: {
    registry_gst: CoreDimensionCard;
    court_litigation: CoreDimensionCard;
    blacklist_debarment: CoreDimensionCard;
    negative_news: CoreDimensionCard;
  };
  briefSummary: {
    text: string;
    citedEvidenceIds: string[];
    generatedBy: 'DETERMINISTIC_RULES' | 'GEMINI_ASSISTED';
  };
  sourcesChecked?: string[];
  totalSourcesEvaluated?: number;
  createdAt?: string;
  factorScores?: any;
  primaryRuleApplied?: string;
  evaluatedAt?: string;
  dimensionCards?: any;
  unresolvedQueue?: any[];
}

export type AssessmentReport = VendorTraceAssessmentReport;
