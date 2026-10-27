/**
 * Comprehensive TypeScript Domain Models for VendorTrace
 * Enterprise Due Diligence & Entity Tracing Platform
 */

export type IdentifierKind = 'CIN' | 'GSTIN' | 'PAN' | 'DIN' | 'NAME';

export type CompanyRegistryStatus =
  | 'ACTIVE'
  | 'STRIKE_OFF'
  | 'UNDER_LIQUIDATION'
  | 'AMALGAMATED'
  | 'DORMANT'
  | 'UNDER_PROCESS_OF_STRIKING_OFF'
  | 'UNKNOWN';

export type RiskVerdict = 'VERIFIED_CLEAR' | 'CAUTION' | 'MATERIAL_RISK' | 'UNKNOWN';

export type SignalConfidence =
  | 'CORROBORATED'           // Verified across >= 2 independent sources
  | 'REQUIRES_HUMAN_REVIEW'  // Single source only or low identity match
  | 'CONFLICTING_EVIDENCE'   // Inconsistency across official registries
  | 'UNRESOLVED';            // Pending manual legal/procurement audit

export type SignalLifecycleStatus = 'ACTIVE' | 'RESOLVED' | 'DISMISSED' | 'MONITORING';

export type SignalDimension =
  | 'REGISTRY_STATUS'
  | 'TAX_COMPLIANCE'
  | 'LITIGATION'
  | 'DEBARMENT'
  | 'ADVERSE_MEDIA'
  | 'GOVERNANCE';

export type SourceType =
  | 'IndiaCos'
  | 'TinyFish'
  | 'OfficialRegistry'
  | 'NewsMedia'
  | 'Other';

export type RelationshipType =
  | 'SHARED_DIRECTOR'
  | 'SHARED_ADDRESS'
  | 'LINKED_GST_CIN'
  | 'PARENT_SUBSIDIARY'
  | 'OTHER';

export type MatchStrength =
  | 'EXACT_IDENTIFIER'
  | 'STRONG_NAME_AND_ADDRESS'
  | 'PROBABLE'
  | 'WEAK';

/**
 * 1. Vendor Model
 */
export interface Vendor {
  id: string; // Stable ID, e.g. "ven_1792857000_abc12"
  canonicalName: string; // Verified legal registered name
  inputNames: string[]; // Queries, trade names, aliases
  cin: string | null; // 21-character Corporate Identification Number
  gstins: string[]; // List of registered GSTINs
  pan: string | null; // Permanent Account Number (only if returned/needed)
  companyStatus: CompanyRegistryStatus;
  registeredAddress: string | null;
  sourceReference: string; // e.g. "MCA21 Registry via IndiaCos"
  firstSeenAt: string; // ISO 8601 timestamp
  lastCheckedAt: string; // ISO 8601 timestamp
  latestRiskStatus: RiskVerdict;
}

/**
 * 2. Evidence Model
 */
export interface Evidence {
  id: string; // Stable ID, e.g. "evi_1792857000_xyz89"
  sourceName: string;
  sourceDomain: string;
  sourceUrl: string | null;
  quote: string; // Direct snippet or registry text
  publishedAt: string | null; // Publication date if known
  capturedAt: string; // ISO timestamp when evidence was fetched
  underlyingSource: string; // Provenance metadata
  sourceType: SourceType;
  identityMatchNotes: string; // Match justification (e.g. "Exact 21-char CIN match")
}

/**
 * 3. Signal Model
 */
export interface Signal {
  id: string; // Stable ID, e.g. "sig_1792857000_ijk34"
  investigationId: string;
  vendorId: string;
  dimension: SignalDimension;
  title: string;
  neutralSummary: string; // Fact-grounded summary without subjective rhetoric
  severity: 1 | 2 | 3 | 4 | 5; // 1 = Low/Info, 3 = Caution, 5 = Critical/Material Risk
  evidenceIds: string[]; // Associated Evidence record IDs
  confidenceStatus: SignalConfidence;
  firstSeenAt: string;
  lastSeenAt: string;
  lifecycleStatus: SignalLifecycleStatus;
  reviewNote: string | null;
}

/**
 * 4. Relationship Model
 */
export interface Relationship {
  id: string; // Stable ID, e.g. "rel_1792857000_rst56"
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: RelationshipType;
  evidenceIds: string[];
  matchStrength: MatchStrength;
  firstSeenAt: string;
  details?: {
    directorName?: string;
    din?: string;
    commonAddress?: string;
    notes?: string;
  };
}

/**
 * 5. Investigation Model
 */
export interface Investigation {
  id: string; // Stable ID, e.g. "inv_1792857000_mno78"
  vendorId: string;
  requestedIdentifier: {
    type: IdentifierKind;
    value: string;
  };
  startedAt: string;
  completedAt: string | null;
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'PARTIAL_FAILURE' | 'FAILED' | 'CANCELLED';
  providerStatuses: Record<
    string,
    {
      configured: boolean;
      status: 'OK' | 'UNAVAILABLE' | 'ERROR';
      latencyMs?: number;
      notes?: string;
    }
  >;
  summary: {
    verdict: RiskVerdict;
    narrative: string;
    totalSignals: number;
    corroboratedSignals: number;
    reviewNeededSignals: number;
    highSeveritySignals: number;
  };
  latestReportReference: string | null; // e.g. audit artifact ID or checksum
}

/**
 * 6. Run Comparison Model
 */
export interface RunComparison {
  id: string; // Stable ID, e.g. "cmp_1792857000_uvw90"
  previousRunId: string;
  currentRunId: string;
  newSignalIds: string[];
  changedSignalIds: string[];
  removedSignalIds: string[];
  unresolvedSignalIds: string[];
  comparedAt: string;
}

/**
 * Pagination & Query contracts
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface StorageStatus {
  mode: 'FIRESTORE' | 'DEVELOPMENT_IN_MEMORY_NON_DURABLE';
  isDurable: boolean;
  activeAdapterName: string;
  warning?: string;
}
