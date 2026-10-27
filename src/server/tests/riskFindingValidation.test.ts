/**
 * Risk Finding Validation & Schema Quality Test Suite
 * Tests missing fields, malformed URLs, duplicate evidence, conflicting dates,
 * and confidence calculation rules.
 */

import {
  validateRiskFinding,
  validateUrl,
  validateEvidenceTimestamps,
  validateTopLevelJsonSchema,
  deduplicateEvidence,
  SchemaValidationError,
} from '../validation/riskFindingValidator.js';
import {
  COURT_LITIGATION_OUTPUT_SCHEMA,
  BLACKLIST_DEBARMENT_OUTPUT_SCHEMA,
  ADVERSE_NEWS_OUTPUT_SCHEMA,
} from '../providers/tinyfishSchemas.js';
import { EvidenceItem } from '../../types/riskFinding.js';

export async function runRiskFindingValidationTests(): Promise<{
  success: boolean;
  assertionsPassed: number;
  assertionsFailed: number;
  logs: string[];
}> {
  const logs: string[] = [];
  let assertionsPassed = 0;
  let assertionsFailed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      assertionsPassed++;
      logs.push(`[PASS] ${desc}`);
    } else {
      assertionsFailed++;
      logs.push(`[FAIL] ${desc}`);
    }
  }

  logs.push('=== 1. TESTING TINYFISH TOP-LEVEL JSON SCHEMAS ===');
  assert(validateTopLevelJsonSchema(COURT_LITIGATION_OUTPUT_SCHEMA).valid, 'Court litigation output_schema is a valid top-level JSON object');
  assert(validateTopLevelJsonSchema(BLACKLIST_DEBARMENT_OUTPUT_SCHEMA).valid, 'Blacklist/debarment output_schema is a valid top-level JSON object');
  assert(validateTopLevelJsonSchema(ADVERSE_NEWS_OUTPUT_SCHEMA).valid, 'Adverse news output_schema is a valid top-level JSON object');

  // Test schema rejection for invalid schemas
  assert(!validateTopLevelJsonSchema(null).valid, 'Rejects null schema');
  assert(!validateTopLevelJsonSchema([]).valid, 'Rejects array schema');
  assert(!validateTopLevelJsonSchema({ type: 'string' }).valid, "Rejects schema where type is not 'object'");

  logs.push('\n=== 2. TESTING URL VALIDATION & PROTOCOL SECURITY ===');
  const validHttps = validateUrl('https://mca.gov.in/portal/company/L27100MH1907PLC000260?utm_source=test&utm_medium=email');
  assert(validHttps.valid, 'Valid HTTPS URL is accepted');
  assert(validHttps.normalizedUrl === 'https://mca.gov.in/portal/company/L27100MH1907PLC000260', 'Strips marketing/tracking query parameters (utm_*)');

  const validNull = validateUrl(null);
  assert(validNull.valid && validNull.normalizedUrl === null, 'Null URL is permitted (for private registry files)');

  const malformedProto = validateUrl('ftp://invalidsite.com/file');
  assert(!malformedProto.valid, "Rejects unsupported protocol 'ftp://'");

  const javascriptProto = validateUrl('javascript:alert(1)');
  assert(!javascriptProto.valid, "Rejects XSS 'javascript:' URI");

  const malformedString = validateUrl('not a url at all');
  assert(!malformedString.valid, 'Rejects arbitrary non-URL text');

  logs.push('\n=== 3. TESTING EVIDENCE TIMESTAMPS & CONFLICTING DATES ===');
  const now = new Date().toISOString();
  const pastPublished = '2025-01-01T00:00:00.000Z';
  const validTs = validateEvidenceTimestamps(pastPublished, now);
  assert(validTs.valid, 'Past publishedAt with present capturedAt is valid');

  // Conflicting date: published date is tomorrow / 1 month in the future
  const futurePublished = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const conflictingTs = validateEvidenceTimestamps(futurePublished, now);
  assert(!conflictingTs.valid, 'Rejects conflicting future publishedAt timestamp (> 5min beyond capturedAt)');

  logs.push('\n=== 4. TESTING EVIDENCE DEDUPLICATION & PRESS RELEASE SYNDICATION ===');
  const rawEvidence: EvidenceItem[] = [
    {
      sourceName: 'Economic Times',
      sourceDomain: 'economictimes.indiatimes.com',
      url: 'https://economictimes.indiatimes.com/news/article1?ref=home',
      snippet: 'State authority initiates standard regulatory compliance check on supplier filings.',
      publishedAt: pastPublished,
      capturedAt: now,
      underlyingSource: 'Financial Press',
      identityMatchNote: 'Exact Name',
    },
    {
      // Duplicate by URL (different tracking param)
      sourceName: 'Economic Times Mirror',
      sourceDomain: 'economictimes.indiatimes.com',
      url: 'https://economictimes.indiatimes.com/news/article1?utm_source=twitter',
      snippet: 'State authority initiates standard regulatory compliance check on supplier filings.',
      publishedAt: pastPublished,
      capturedAt: now,
      underlyingSource: 'Financial Press',
      identityMatchNote: 'Exact Name',
    },
    {
      // Syndicated press wire
      sourceName: 'ANI News',
      sourceDomain: 'aninews.in',
      url: 'https://aninews.in/news/business/pr-release-1',
      snippet: 'Company issues official press release detailing its annual environmental compliance achievements.',
      publishedAt: pastPublished,
      capturedAt: now,
      underlyingSource: 'ANI Wire Service',
      identityMatchNote: 'Exact Name',
      isPressReleaseRepetition: true,
    },
    {
      // Syndicated reprint of the same press release on another site
      sourceName: 'Business Standard Wire Feed',
      sourceDomain: 'business-standard.com',
      url: 'https://business-standard.com/press-release-1',
      snippet: 'Company issues official press release detailing its annual environmental compliance achievements.',
      publishedAt: pastPublished,
      capturedAt: now,
      underlyingSource: 'Syndicated Wire',
      identityMatchNote: 'Exact Name',
      isPressReleaseRepetition: true,
    },
  ];

  const { deduplicated, duplicateCount, distinctDomains } = deduplicateEvidence(rawEvidence);
  assert(duplicateCount === 2, 'Deduplicates identical URL and identical snippet text');
  assert(deduplicated.length === 2, 'Reduces 4 raw items to 2 distinct evidence items');
  // Both syndicated press release copies group into one domain
  assert(distinctDomains.has('syndicated_press_release_cluster'), 'Groups syndicated wire copies under a single domain cluster');

  logs.push('\n=== 5. TESTING RISK FINDING VALIDATION & ZERO-FABRICATION ===');
  // Test missing title rejection
  let threwForTitle = false;
  try {
    validateRiskFinding({
      dimension: 'company_registry',
      title: '',
      neutralSummary: 'Summary',
      status: 'signal_found',
      severity: 3,
      severityExplanation: 'Explanation',
      evidence: [],
      recommendedReviewAction: 'Action',
    });
  } catch (err: any) {
    if (err instanceof SchemaValidationError && err.field === 'title') {
      threwForTitle = true;
    }
  }
  assert(threwForTitle, 'Throws SchemaValidationError when finding title is missing or empty');

  // Test missing severity explanation rejection
  let threwForExplanation = false;
  try {
    validateRiskFinding({
      dimension: 'court_litigation',
      title: 'Valid Title',
      neutralSummary: 'Summary',
      status: 'signal_found',
      severity: 3,
      severityExplanation: '',
      evidence: [],
      recommendedReviewAction: 'Action',
    });
  } catch (err: any) {
    if (err instanceof SchemaValidationError && err.field === 'severityExplanation') {
      threwForExplanation = true;
    }
  }
  assert(threwForExplanation, 'Throws SchemaValidationError when rule-based severityExplanation is missing');

  // Test confidence calculation: single source -> single_source_review
  const singleSourceFinding = validateRiskFinding({
    dimension: 'court_litigation',
    title: 'Pending Commercial Suit',
    neutralSummary: 'Civil suit pending in High Court regarding commercial supplier invoice dispute.',
    status: 'signal_found',
    severity: 3,
    severityExplanation: 'Pending commercial suit (allegation stage; merits not adjudicated).',
    evidence: [
      {
        sourceName: 'Delhi High Court',
        sourceDomain: 'delhihighcourt.nic.in',
        url: 'https://delhihighcourt.nic.in/case/123',
        snippet: 'Notice issued to respondent; reply pending.',
        publishedAt: pastPublished,
        capturedAt: now,
        underlyingSource: 'High Court Docket',
        identityMatchNote: 'Exact party name match',
        legalStatus: 'alleged',
      },
    ],
    recommendedReviewAction: 'Request status affidavit from vendor legal team.',
  });
  assert(singleSourceFinding.confidence === 'single_source_review', 'Assigns single_source_review confidence when supported by only 1 source');
  assert(singleSourceFinding.evidence[0].legalStatus === 'alleged', "Distinguishes 'alleged' legal status properly");

  return {
    success: assertionsFailed === 0,
    assertionsPassed,
    assertionsFailed,
    logs,
  };
}
