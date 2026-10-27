/**
 * Core domain types for VendorTrace
 * Enterprise Due Diligence & Entity Tracing Platform
 */

export type IdentifierType = 'CIN' | 'GSTIN' | 'PAN' | 'DIN' | 'NAME';

export type SourceCategory = 'REGISTRY' | 'TAX' | 'LEGAL' | 'DEBARMENT' | 'MEDIA';

export type ConnectorStatus = 'HEALTHY' | 'CONFIGURED' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_CONFIGURED';

export interface SourceConnector {
  id: string;
  name: string;
  category: SourceCategory;
  isConfigured: boolean;
  status: ConnectorStatus;
  lastChecked: string;
  coverageNote: string;
  latencyMs?: number;
}

export type FindingRiskLevel = 'VERIFIED_CLEAR' | 'CAUTION' | 'MATERIAL_RISK' | 'UNKNOWN';

export type FindingVerificationStatus =
  | 'CORROBORATED'           // Verified across >= 2 independent sources
  | 'REQUIRES_HUMAN_REVIEW'  // Single source only or low identity match
  | 'CONFLICTING_EVIDENCE'   // Discrepancy between independent registries
  | 'UNRESOLVED';            // Pending manual documentation check

export interface FindingEvidence {
  sourceTitle?: string;
  publisher?: string;
  searchResultUrl?: string;
  sourceFetchError?: string;
  sourceName: string;
  sourceDomain: string;
  url: string | null;
  snippet: string;
  retrievedAt: string;
  provenance: string;
  matchConfidence: 'EXACT_IDENTIFIER' | 'NAME_AND_ADDRESS' | 'FUZZY_NAME_ONLY';
  searchQuery?: string;
  identityMatchNote?: string;
  expandedText?: string;
}

export interface Finding {
  id: string;
  category: SourceCategory;
  title: string;
  claim: string;
  riskLevel: FindingRiskLevel;
  verificationStatus: FindingVerificationStatus;
  isAllegation: boolean; // Distinguishes court allegation from adjudicated final outcome
  sources: FindingEvidence[];
  identityMatchStrength: 'EXACT' | 'HIGH' | 'PROBABLE' | 'WEAK';
  notesForOfficer?: string;
}

export type RelationType = 
  | 'SHARED_DIRECTOR' 
  | 'REGISTERED_ADDRESS' 
  | 'PARENT_HOLDING' 
  | 'SUBSIDIARY';

export interface RelatedEntityLead {
  id: string;
  legalName: string;
  cin: string | null;
  relationType: RelationType;
  sharedDirectorName?: string;
  sharedDin?: string;
  sharedAddress?: string;
  companyStatus: string; // e.g. Active, Strike Off, Under Liquidation
  leadDisclaimer: string; // "Discovery lead for manual audit; shared registry linkage does not imply misconduct."
}

import { DimensionTaskResult, RiskFinding } from './riskFinding.js';

export interface Investigation {
  id: string;
  targetName: string;
  identifierType: IdentifierType;
  identifierValue: string;
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'PARTIAL_FAILURE' | 'CANCELLED';
  createdAt: string;
  completedAt?: string;
  requestedBy: string;
  /** Execution mode captured when this report was created; historical reports are never relabeled. */
  executionMode?: 'DEMO' | 'LIVE';
  providerLabels?: string[];
  sourcesChecked: string[];
  findingsCount: {
    verifiedClear: number;
    caution: number;
    materialRisk: number;
    requiresReview: number;
  };
  findings: Finding[];
  normalizedFindings?: RiskFinding[];
  dimensionResults?: Record<string, DimensionTaskResult>;
  coverageGaps?: string[];
  coverageStatus?: 'COMPLETE' | 'PARTIAL';
  terminationReason?: 'TIMEOUT' | 'CANCELLED' | null;
  totalDurationMs?: number;
  relatedLeads: RelatedEntityLead[];
  entityGraph?: import('./entityTracing.js').EntityGraph;
  assessmentReport?: import('./crossValidation.js').VendorTraceAssessmentReport;
  summaryNarrative?: string;
}

export interface WorkspaceStats {
  totalInvestigations: number | null;
  totalTrackedVendors: number | null;
  pendingReviews: number | null;
  highRiskFlags: number | null;
  connectorsActive: number;
  connectorsTotal: number;
}
