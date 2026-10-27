/**
 * Schema Validation, Deduplication, and Normalization Logic for Risk Findings
 * Enforces Zero-Fabrication, Top-Level JSON Object Schemas, and Provenance Discipline.
 */

import {
  RiskFinding,
  EvidenceItem,
  RiskDimension,
  FindingStatus,
  FindingConfidence,
  LegalDisputeStatus,
} from '../../types/riskFinding.js';

export class SchemaValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(`[SchemaValidationError] ${field}: ${message}`);
    this.name = 'SchemaValidationError';
  }
}

/**
 * Validates that a TinyFish output_schema is a strict top-level JSON object.
 */
export function validateTopLevelJsonSchema(schema: any): { valid: boolean; error?: string } {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { valid: false, error: 'TinyFish output_schema must be a top-level JSON object.' };
  }
  if (schema.type !== 'object') {
    return { valid: false, error: "TinyFish output_schema must have 'type': 'object' at the top level." };
  }
  if (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) {
    return { valid: false, error: "TinyFish output_schema must define a 'properties' object." };
  }
  return { valid: true };
}

/**
 * Validates a web URL format. Only absolute HTTP/HTTPS URLs or null are valid.
 */
export function validateUrl(url: string | null | undefined): { valid: boolean; normalizedUrl: string | null; error?: string } {
  if (url === null || url === undefined || url === '') {
    return { valid: true, normalizedUrl: null };
  }

  const trimmed = String(url).trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return {
      valid: false,
      normalizedUrl: null,
      error: `Malformed URL '${trimmed}'. Must begin with 'http://' or 'https://'.`,
    };
  }

  try {
    const parsed = new URL(trimmed);
    // Remove transient tracking query parameters (e.g. utm_source, utm_medium, ref, fbclid)
    const searchParams = new URLSearchParams(parsed.search);
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref'];
    for (const p of trackingParams) {
      searchParams.delete(p);
    }
    const cleanSearch = searchParams.toString();
    const cleanUrl = `${parsed.origin}${parsed.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${parsed.hash || ''}`;
    return { valid: true, normalizedUrl: cleanUrl };
  } catch (err: any) {
    return {
      valid: false,
      normalizedUrl: null,
      error: `Malformed URL syntax: ${err.message || String(err)}`,
    };
  }
}

/**
 * Validates ISO 8601 timestamps and checks for date conflicts.
 * Conflicting dates: publishedAt occurs in the future relative to capturedAt (with 5-minute clock skew tolerance).
 */
export function validateEvidenceTimestamps(
  publishedAt: string | null | undefined,
  capturedAt: string
): { valid: boolean; publishedIso: string | null; capturedIso: string; error?: string } {
  const capturedDate = new Date(capturedAt);
  if (isNaN(capturedDate.getTime())) {
    return {
      valid: false,
      publishedIso: null,
      capturedIso: capturedAt,
      error: `Invalid capturedAt timestamp: '${capturedAt}'`,
    };
  }

  let publishedIso: string | null = null;
  if (publishedAt) {
    const pubDate = new Date(publishedAt);
    if (isNaN(pubDate.getTime())) {
      return {
        valid: false,
        publishedIso: null,
        capturedIso: capturedDate.toISOString(),
        error: `Invalid publishedAt timestamp: '${publishedAt}'`,
      };
    }
    publishedIso = pubDate.toISOString();

    // Check conflicting date: published date is far in the future compared to captured date (> 5 min tolerance)
    const timeDiffMs = pubDate.getTime() - capturedDate.getTime();
    if (timeDiffMs > 5 * 60 * 1000) {
      return {
        valid: false,
        publishedIso,
        capturedIso: capturedDate.toISOString(),
        error: `Conflicting dates: publishedAt (${publishedIso}) is in the future relative to capturedAt (${capturedDate.toISOString()}).`,
      };
    }
  }

  return {
    valid: true,
    publishedIso,
    capturedIso: capturedDate.toISOString(),
  };
}

/**
 * Known syndicated press release distribution networks
 */
const PRESS_RELEASE_DOMAINS = new Set([
  'prnewswire.com',
  'businesswire.com',
  'globenewswire.com',
  'aninews.in',
  'ptinews.com',
  'newsVoir.com',
  'bignewsnetwork.com',
]);

/**
 * Checks if a domain is a known press release wire or syndicated news feed.
 */
export function isSyndicatedPressRelease(domain: string, snippet?: string): boolean {
  if (!domain) return false;
  const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
  if (PRESS_RELEASE_DOMAINS.has(cleanDomain)) {
    return true;
  }
  if (snippet) {
    const lower = snippet.toLowerCase();
    if (
      lower.includes('press release') ||
      lower.includes('(business wire)') ||
      lower.includes('(pr newswire)') ||
      lower.includes('(ani)') ||
      lower.includes('distributed by')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Deduplicates evidence items by normalized URL or snippet text hash,
 * and marks press release syndications so they do not artificially inflate source independence.
 */
export function deduplicateEvidence(evidenceList: EvidenceItem[]): {
  deduplicated: EvidenceItem[];
  duplicateCount: number;
  distinctDomains: Set<string>;
} {
  const seenUrls = new Set<string>();
  const seenSnippets = new Set<string>();
  const deduplicated: EvidenceItem[] = [];
  let duplicateCount = 0;

  for (const item of evidenceList) {
    // 1. URL normalization check
    let urlKey: string | null = null;
    if (item.url) {
      const urlValidation = validateUrl(item.url);
      if (urlValidation.valid && urlValidation.normalizedUrl) {
        urlKey = urlValidation.normalizedUrl.toLowerCase();
      }
    }

    // 2. Snippet hash / normalized text key (first 100 alphanumeric chars)
    const snippetKey = (item.snippet || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 100);

    const isDuplicateUrl = urlKey !== null && seenUrls.has(urlKey);
    const isDuplicateSnippet = snippetKey.length > 20 && seenSnippets.has(snippetKey);

    if (isDuplicateUrl || isDuplicateSnippet) {
      duplicateCount++;
      continue;
    }

    if (urlKey) seenUrls.add(urlKey);
    if (snippetKey.length > 20) seenSnippets.add(snippetKey);

    // Detect if this evidence is press release syndication
    const isPr = isSyndicatedPressRelease(item.sourceDomain, item.snippet);
    deduplicated.push({
      ...item,
      url: urlKey || item.url || null,
      isPressReleaseRepetition: item.isPressReleaseRepetition || isPr,
    });
  }

  // Calculate distinct independent domains (press releases group together into one effective domain)
  const distinctDomains = new Set<string>();
  let hasPressReleaseGroup = false;

  for (const item of deduplicated) {
    const cleanDomain = item.sourceDomain.toLowerCase().replace(/^www\./, '');
    if (item.isPressReleaseRepetition) {
      if (!hasPressReleaseGroup) {
        distinctDomains.add('syndicated_press_release_cluster');
        hasPressReleaseGroup = true;
      }
    } else {
      distinctDomains.add(cleanDomain);
    }
  }

  return { deduplicated, duplicateCount, distinctDomains };
}

/**
 * Evaluates the confidence level based on corroborated independent sources,
 * press release deduplication, and presence of conflicting evidence.
 */
export function evaluateFindingConfidence(options: {
  evidence: EvidenceItem[];
  status: FindingStatus;
  distinctIndependentSourcesCount: number;
  hasConflicts?: boolean;
}): FindingConfidence {
  const { status, distinctIndependentSourcesCount, hasConflicts } = options;

  if (hasConflicts || status === 'conflicting_evidence') {
    return 'conflicting_sources';
  }

  if (status === 'source_unavailable' || distinctIndependentSourcesCount === 0) {
    return 'insufficient_evidence';
  }

  if (distinctIndependentSourcesCount >= 2) {
    return 'multiple_independent_sources';
  }

  return 'single_source_review';
}

/**
 * Validates and normalizes a complete RiskFinding contract.
 * Enforces Zero-Fabrication discipline: missing fields must not be invented.
 */
export function validateRiskFinding(finding: Partial<RiskFinding>): RiskFinding {
  // 1. Dimension check
  const validDimensions: RiskDimension[] = [
    'company_registry',
    'gst_compliance',
    'court_litigation',
    'blacklist_debarment',
    'negative_news',
  ];
  if (!finding.dimension || !validDimensions.includes(finding.dimension)) {
    throw new SchemaValidationError(
      'dimension',
      `Invalid dimension '${finding.dimension}'. Must be one of: ${validDimensions.join(', ')}`
    );
  }

  // 2. Title & neutral summary
  if (!finding.title || typeof finding.title !== 'string' || finding.title.trim().length === 0) {
    throw new SchemaValidationError('title', 'Finding title is required and must be non-empty.');
  }
  if (!finding.neutralSummary || typeof finding.neutralSummary !== 'string' || finding.neutralSummary.trim().length === 0) {
    throw new SchemaValidationError('neutralSummary', 'Neutral summary is required and must be non-empty.');
  }

  // 3. Status check
  const validStatuses: FindingStatus[] = [
    'signal_found',
    'no_signal_found_in_checked_sources',
    'inconclusive',
    'source_unavailable',
    'conflicting_evidence',
  ];
  if (!finding.status || !validStatuses.includes(finding.status)) {
    throw new SchemaValidationError(
      'status',
      `Invalid status '${finding.status}'. Must be one of: ${validStatuses.join(', ')}`
    );
  }

  // 4. Severity (integer 1-5) and rule-based explanation
  const severity = Number(finding.severity);
  if (!Number.isInteger(severity) || severity < 1 || severity > 5) {
    throw new SchemaValidationError('severity', `Severity must be an integer between 1 and 5. Received: ${finding.severity}`);
  }
  if (!finding.severityExplanation || typeof finding.severityExplanation !== 'string' || finding.severityExplanation.trim().length === 0) {
    throw new SchemaValidationError('severityExplanation', 'A short rule-based explanation for severity is required.');
  }

  // 5. Evidence Array Validation & Deduplication
  const rawEvidence = Array.isArray(finding.evidence) ? finding.evidence : [];
  const validatedEvidence: EvidenceItem[] = [];

  for (let i = 0; i < rawEvidence.length; i++) {
    const ev = rawEvidence[i];
    if (!ev.sourceName || typeof ev.sourceName !== 'string') {
      throw new SchemaValidationError(`evidence[${i}].sourceName`, 'Evidence sourceName is required.');
    }
    if (!ev.sourceDomain || typeof ev.sourceDomain !== 'string') {
      throw new SchemaValidationError(`evidence[${i}].sourceDomain`, 'Evidence sourceDomain is required.');
    }
    const sourceFetchError = typeof ev.sourceFetchError === 'string' ? ev.sourceFetchError.trim() : '';
    if ((!ev.snippet || typeof ev.snippet !== 'string' || ev.snippet.trim().length === 0) && !sourceFetchError) {
      throw new SchemaValidationError(`evidence[${i}].snippet`, 'Evidence excerpt is required unless source retrieval failed and that failure is recorded.');
    }

    // URL validation
    const urlValidation = validateUrl(ev.url);
    if (!urlValidation.valid) {
      throw new SchemaValidationError(`evidence[${i}].url`, urlValidation.error || 'Invalid URL format');
    }
    const searchResultUrlValidation = validateUrl(ev.searchResultUrl);
    if (!searchResultUrlValidation.valid) {
      throw new SchemaValidationError(`evidence[${i}].searchResultUrl`, searchResultUrlValidation.error || 'Invalid search result URL format');
    }

    // Timestamp validation
    const capturedAt = ev.capturedAt || new Date().toISOString();
    const tsValidation = validateEvidenceTimestamps(ev.publishedAt, capturedAt);
    if (!tsValidation.valid) {
      throw new SchemaValidationError(`evidence[${i}].timestamps`, tsValidation.error || 'Timestamp validation error');
    }

    // Legal status validation
    const validLegalStatuses: LegalDisputeStatus[] = ['alleged', 'pending', 'dismissed', 'disposed', 'settled', 'confirmed', null];
    const legalStatus = ev.legalStatus !== undefined ? ev.legalStatus : null;
    if (legalStatus !== null && !validLegalStatuses.includes(legalStatus)) {
      throw new SchemaValidationError(
        `evidence[${i}].legalStatus`,
        `Invalid legalStatus '${legalStatus}'. Must be one of: alleged, pending, dismissed, disposed, settled, confirmed, null.`
      );
    }

    validatedEvidence.push({
      id: ev.id,
      sourceTitle: typeof ev.sourceTitle === 'string' ? ev.sourceTitle.trim() : undefined,
      publisher: typeof ev.publisher === 'string' ? ev.publisher.trim() : undefined,
      searchResultUrl: searchResultUrlValidation.normalizedUrl || undefined,
      sourceFetchError: sourceFetchError || undefined,
      sourceName: ev.sourceName.trim(),
      sourceDomain: ev.sourceDomain.trim().toLowerCase(),
      url: urlValidation.normalizedUrl,
      snippet: ev.snippet.trim(),
      publishedAt: tsValidation.publishedIso,
      capturedAt: tsValidation.capturedIso,
      underlyingSource: ev.underlyingSource ? ev.underlyingSource.trim() : 'Official Registry / Public Records',
      identityMatchNote: ev.identityMatchNote ? ev.identityMatchNote.trim() : 'Unspecified match basis',
      searchQuery: typeof ev.searchQuery === 'string' ? ev.searchQuery.trim() : undefined,
      expandedText: typeof ev.expandedText === 'string' ? ev.expandedText.slice(0, 4000) : undefined,
      caseId: typeof ev.caseId === 'string' ? ev.caseId.trim() : undefined,
      caseTitle: typeof ev.caseTitle === 'string' ? ev.caseTitle.trim() : undefined,
      caseNumber: typeof ev.caseNumber === 'string' ? ev.caseNumber.trim() : undefined,
      caseCourt: typeof ev.caseCourt === 'string' ? ev.caseCourt.trim() : undefined,
      casePetitioner: typeof ev.casePetitioner === 'string' ? ev.casePetitioner.trim() : undefined,
      caseRespondent: typeof ev.caseRespondent === 'string' ? ev.caseRespondent.trim() : undefined,
      caseParties: typeof ev.caseParties === 'string' ? ev.caseParties.trim() : undefined,
      caseMatchedParty: typeof ev.caseMatchedParty === 'string' ? ev.caseMatchedParty.trim() : undefined,
      caseStatus: typeof ev.caseStatus === 'string' ? ev.caseStatus.trim() : undefined,
      caseDate: typeof ev.caseDate === 'string' ? ev.caseDate.trim() : undefined,
      legalStatus,
      isPressReleaseRepetition: Boolean(ev.isPressReleaseRepetition),
      syndicatedFromDomain: ev.syndicatedFromDomain || null,
    });
  }

  // Deduplicate evidence & compute distinct independent sources
  const { deduplicated, distinctDomains } = deduplicateEvidence(validatedEvidence);

  // 6. Confidence evaluation
  const computedConfidence = evaluateFindingConfidence({
    evidence: deduplicated,
    status: finding.status,
    distinctIndependentSourcesCount: distinctDomains.size,
    hasConflicts: finding.status === 'conflicting_evidence',
  });

  const confidence = finding.confidence && ['multiple_independent_sources', 'single_source_review', 'conflicting_sources', 'insufficient_evidence'].includes(finding.confidence)
    ? finding.confidence
    : computedConfidence;

  // 7. Recommended Review Action (must not be a final legal conclusion)
  if (!finding.recommendedReviewAction || typeof finding.recommendedReviewAction !== 'string' || finding.recommendedReviewAction.trim().length === 0) {
    throw new SchemaValidationError(
      'recommendedReviewAction',
      'Recommended review action is required (should recommend practical compliance checks, not legal conclusions).'
    );
  }

  const id = finding.id || `rf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const createdAt = finding.createdAt || new Date().toISOString();

  return {
    id,
    dimension: finding.dimension,
    title: finding.title.trim(),
    neutralSummary: finding.neutralSummary.trim(),
    status: finding.status,
    severity: severity as 1 | 2 | 3 | 4 | 5,
    severityExplanation: finding.severityExplanation.trim(),
    evidence: deduplicated,
    confidence,
    recommendedReviewAction: finding.recommendedReviewAction.trim(),
    missingDataReason: finding.missingDataReason || null,
    createdAt,
  };
}
