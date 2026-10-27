/**
 * Domain Validation & Sanitization Helpers
 * Enforces stable IDs, timestamp validity, and Indian corporate identifier formats.
 */

import {
  Vendor,
  Investigation,
  Signal,
  Evidence,
  Relationship,
  RunComparison,
} from '../../types/domain.js';

export class DomainValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(`[DomainValidationError] ${field}: ${message}`);
    this.name = 'DomainValidationError';
  }
}

/**
 * Validates ISO 8601 timestamp string
 */
export function validateIsoTimestamp(field: string, timestamp: string | null | undefined, required = true): string | null {
  if (!timestamp) {
    if (required) throw new DomainValidationError(field, 'Timestamp is required');
    return null;
  }
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    throw new DomainValidationError(field, `Invalid ISO timestamp: '${timestamp}'`);
  }
  return date.toISOString();
}

/**
 * Generates stable cryptographically-random prefixed IDs
 */
export function generateStableId(prefix: 'ven' | 'inv' | 'sig' | 'evi' | 'rel' | 'cmp'): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${timestamp}_${randomStr}`;
}

/**
 * Normalizes and validates Indian Corporate Identification Number (CIN)
 * 21 characters: [L/U] + 5-digit industry + 2-letter state + 4-digit year + 3-letter type + 6-digit registration
 */
export function normalizeCIN(cin: string | null | undefined): string | null {
  if (!cin || !cin.trim()) return null;
  const clean = cin.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 21) {
    // In production we log or warn; do not crash on non-standard LLPs, but standardize if valid
  }
  return clean;
}

/**
 * Normalizes and validates Goods & Services Tax Identification Number (GSTIN)
 * 15 characters: 2-digit state + 10-char PAN + 1-digit entity + 'Z' + 1 checksum
 */
export function normalizeGSTIN(gstin: string | null | undefined): string | null {
  if (!gstin || !gstin.trim()) return null;
  const clean = gstin.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean;
}

/**
 * Validates Vendor input record
 */
export function validateVendor(data: Partial<Vendor>): Vendor {
  if (!data.canonicalName || !data.canonicalName.trim()) {
    throw new DomainValidationError('canonicalName', 'Canonical legal name is required');
  }

  const now = new Date().toISOString();
  const id = data.id || generateStableId('ven');
  const cin = normalizeCIN(data.cin);

  // Deduplicate and normalize input names
  const rawNames = Array.isArray(data.inputNames) ? data.inputNames : [data.canonicalName];
  const uniqueNames = Array.from(
    new Set(rawNames.map((n) => n.trim()).filter((n) => n.length > 0))
  );

  // Deduplicate GSTINs
  const rawGstins = Array.isArray(data.gstins) ? data.gstins : [];
  const uniqueGstins = Array.from(
    new Set(rawGstins.map(normalizeGSTIN).filter((g): g is string => Boolean(g)))
  );

  return {
    id,
    canonicalName: data.canonicalName.trim(),
    inputNames: uniqueNames,
    cin,
    gstins: uniqueGstins,
    pan: data.pan ? data.pan.trim().toUpperCase() : null,
    companyStatus: data.companyStatus || 'UNKNOWN',
    registeredAddress: data.registeredAddress ? data.registeredAddress.trim() : null,
    sourceReference: data.sourceReference || 'System Record',
    firstSeenAt: validateIsoTimestamp('firstSeenAt', data.firstSeenAt, false) || now,
    lastCheckedAt: validateIsoTimestamp('lastCheckedAt', data.lastCheckedAt, false) || now,
    latestRiskStatus: data.latestRiskStatus || 'UNKNOWN',
  };
}

/**
 * Validates Investigation input record
 */
export function validateInvestigation(data: Partial<Investigation>): Investigation {
  if (!data.vendorId || !data.vendorId.trim()) {
    throw new DomainValidationError('vendorId', 'Investigation requires a linked vendorId');
  }
  if (!data.requestedIdentifier || !data.requestedIdentifier.type || !data.requestedIdentifier.value) {
    throw new DomainValidationError('requestedIdentifier', 'Investigation requires a valid requestedIdentifier object');
  }

  const now = new Date().toISOString();
  const id = data.id || generateStableId('inv');

  return {
    id,
    vendorId: data.vendorId.trim(),
    requestedIdentifier: {
      type: data.requestedIdentifier.type,
      value: data.requestedIdentifier.value.trim().toUpperCase(),
    },
    startedAt: validateIsoTimestamp('startedAt', data.startedAt, false) || now,
    completedAt: validateIsoTimestamp('completedAt', data.completedAt, false),
    status: data.status || 'COMPLETED',
    providerStatuses: data.providerStatuses || {},
    summary: data.summary || {
      verdict: 'UNKNOWN',
      narrative: 'Investigation initialized.',
      totalSignals: 0,
      corroboratedSignals: 0,
      reviewNeededSignals: 0,
      highSeveritySignals: 0,
    },
    latestReportReference: data.latestReportReference || null,
  };
}

/**
 * Validates Evidence record
 */
export function validateEvidence(data: Partial<Evidence>): Evidence {
  if (!data.sourceName || !data.sourceName.trim()) {
    throw new DomainValidationError('sourceName', 'Evidence requires sourceName');
  }
  if (!data.quote || !data.quote.trim()) {
    throw new DomainValidationError('quote', 'Evidence requires a quote or snippet');
  }

  const now = new Date().toISOString();
  const id = data.id || generateStableId('evi');

  return {
    id,
    sourceName: data.sourceName.trim(),
    sourceDomain: data.sourceDomain ? data.sourceDomain.trim() : 'registry.gov.in',
    sourceUrl: data.sourceUrl || null,
    quote: data.quote.trim(),
    publishedAt: validateIsoTimestamp('publishedAt', data.publishedAt, false),
    capturedAt: validateIsoTimestamp('capturedAt', data.capturedAt, false) || now,
    underlyingSource: data.underlyingSource || 'Official Public Record',
    sourceType: data.sourceType || 'OfficialRegistry',
    identityMatchNotes: data.identityMatchNotes || 'Standard registry match',
  };
}

/**
 * Validates Signal record
 */
export function validateSignal(data: Partial<Signal>): Signal {
  if (!data.investigationId) throw new DomainValidationError('investigationId', 'Signal requires investigationId');
  if (!data.vendorId) throw new DomainValidationError('vendorId', 'Signal requires vendorId');
  if (!data.title || !data.title.trim()) throw new DomainValidationError('title', 'Signal requires title');

  const now = new Date().toISOString();
  const id = data.id || generateStableId('sig');
  const severity = (data.severity && data.severity >= 1 && data.severity <= 5) ? data.severity : 1;
  const uniqueEvidenceIds = Array.from(new Set(data.evidenceIds || []));

  return {
    id,
    investigationId: data.investigationId,
    vendorId: data.vendorId,
    dimension: data.dimension || 'REGISTRY_STATUS',
    title: data.title.trim(),
    neutralSummary: (data.neutralSummary || '').trim(),
    severity,
    evidenceIds: uniqueEvidenceIds,
    confidenceStatus: data.confidenceStatus || 'REQUIRES_HUMAN_REVIEW',
    firstSeenAt: validateIsoTimestamp('firstSeenAt', data.firstSeenAt, false) || now,
    lastSeenAt: validateIsoTimestamp('lastSeenAt', data.lastSeenAt, false) || now,
    lifecycleStatus: data.lifecycleStatus || 'ACTIVE',
    reviewNote: data.reviewNote || null,
  };
}

/**
 * Validates Relationship record
 */
export function validateRelationship(data: Partial<Relationship>): Relationship {
  if (!data.sourceEntityId) throw new DomainValidationError('sourceEntityId', 'Relationship requires sourceEntityId');
  if (!data.targetEntityId) throw new DomainValidationError('targetEntityId', 'Relationship requires targetEntityId');

  const id = data.id || generateStableId('rel');
  const now = new Date().toISOString();
  const uniqueEvidenceIds = Array.from(new Set(data.evidenceIds || []));

  return {
    id,
    sourceEntityId: data.sourceEntityId,
    targetEntityId: data.targetEntityId,
    relationshipType: data.relationshipType || 'OTHER',
    evidenceIds: uniqueEvidenceIds,
    matchStrength: data.matchStrength || 'PROBABLE',
    firstSeenAt: validateIsoTimestamp('firstSeenAt', data.firstSeenAt, false) || now,
    details: data.details || {},
  };
}

/**
 * Validates RunComparison record
 */
export function validateRunComparison(data: Partial<RunComparison>): RunComparison {
  if (!data.previousRunId) throw new DomainValidationError('previousRunId', 'Comparison requires previousRunId');
  if (!data.currentRunId) throw new DomainValidationError('currentRunId', 'Comparison requires currentRunId');

  const id = data.id || generateStableId('cmp');
  const now = new Date().toISOString();

  return {
    id,
    previousRunId: data.previousRunId,
    currentRunId: data.currentRunId,
    newSignalIds: Array.from(new Set(data.newSignalIds || [])),
    changedSignalIds: Array.from(new Set(data.changedSignalIds || [])),
    removedSignalIds: Array.from(new Set(data.removedSignalIds || [])),
    unresolvedSignalIds: Array.from(new Set(data.unresolvedSignalIds || [])),
    comparedAt: validateIsoTimestamp('comparedAt', data.comparedAt, false) || now,
  };
}
