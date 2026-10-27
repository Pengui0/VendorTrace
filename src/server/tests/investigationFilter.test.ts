/**
 * Investigation Filter & Search Service Unit Tests
 */

import { investigationFilterService } from '../services/investigationFilterService.js';
import { Investigation } from '../../types/vendor.js';
import { keepLatestInvestigationPerIdentity } from '../../utils/investigationIdentity.js';

export async function runFilterTests(): Promise<{
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

  const groupedReports = keepLatestInvestigationPerIdentity([
    { id: 'older', targetName: 'Tata Steel Limited', identifierType: 'CIN', identifierValue: 'L27100MH1907PLC000260', createdAt: '2026-05-10T10:00:00.000Z' },
    { id: 'newer', targetName: 'Tata Steel Limited', identifierType: 'CIN', identifierValue: 'L27100MH1907PLC000260', createdAt: '2026-05-11T10:00:00.000Z' },
    { id: 'other', targetName: 'Another Vendor', identifierType: 'CIN', identifierValue: 'U12345678901234567890', createdAt: '2026-05-09T10:00:00.000Z' },
  ]);
  assert(groupedReports.length === 2 && groupedReports[0].id === 'newer', 'History grouping keeps the newest run for each unique identifier');

  const sampleInvestigations: Investigation[] = [
    {
      id: 'inv_1',
      targetName: 'Tata Steel Limited',
      identifierType: 'CIN',
      identifierValue: 'L27100MH1907PLC000260',
      status: 'COMPLETED',
      createdAt: '2026-05-10T10:00:00.000Z',
      requestedBy: 'Compliance Team',
      sourcesChecked: ['MCA21'],
      findingsCount: { verifiedClear: 1, caution: 0, materialRisk: 0, requiresReview: 0 },
      findings: [],
      relatedLeads: [],
      normalizedFindings: [
        {
          id: 'rf_1',
          dimension: 'company_registry',
          title: 'Active Company Master Record',
          neutralSummary: 'Active entity status in MCA.',
          status: 'signal_found',
          severity: 1,
          severityExplanation: 'Active corporate standing.',
          evidence: [],
          confidence: 'multiple_independent_sources',
          recommendedReviewAction: 'None',
          createdAt: '2026-05-10T10:00:00.000Z',
        },
      ],
      assessmentReport: {
        investigationId: 'inv_1',
        vendorId: 'ven_1',
        vendorName: 'Tata Steel Limited',
        explainableRiskScore: 10,
        reviewPriority: 'STANDARD_PERIODIC_REVIEW',
        overallReviewPriority: 'STANDARD_PERIODIC_REVIEW',
        coverageStatus: 'ADEQUATE',
        factorScores: { severityScore: 5, confidenceScore: 5, recencyScore: 0, identityMatchScore: 0 },
        primaryRuleApplied: 'RULE_LOW_RISK',
        dimensionCards: {} as any,
        briefSummary: { text: 'Clear record.', citedEvidenceIds: [], generatedBy: 'DETERMINISTIC_RULES' },
        unresolvedQueue: [],
        isStale: false,
        evaluatedAt: '2026-05-10T10:00:00.000Z',
      },
    },
    {
      id: 'inv_2',
      targetName: 'Apex Industrial Solutions Pvt Ltd',
      identifierType: 'CIN',
      identifierValue: 'U72900MH2021PTC368940',
      status: 'COMPLETED',
      createdAt: '2026-06-15T12:00:00.000Z',
      requestedBy: 'Audit Lead',
      sourcesChecked: ['GeM', 'Bombay HC'],
      findingsCount: { verifiedClear: 0, caution: 1, materialRisk: 1, requiresReview: 1 },
      findings: [],
      relatedLeads: [],
      normalizedFindings: [
        {
          id: 'rf_2',
          dimension: 'blacklist_debarment',
          title: 'Debarment Notice',
          neutralSummary: 'Debarred on GeM.',
          status: 'signal_found',
          severity: 4,
          severityExplanation: 'Public debarment.',
          evidence: [],
          confidence: 'single_source_review',
          recommendedReviewAction: 'Escalate',
          createdAt: '2026-06-15T12:00:00.000Z',
        },
      ],
      assessmentReport: {
        investigationId: 'inv_2',
        vendorId: 'ven_2',
        vendorName: 'Apex Industrial Solutions Pvt Ltd',
        explainableRiskScore: 85,
        reviewPriority: 'ELEVATED_REVIEW_PRIORITY',
        overallReviewPriority: 'ELEVATED_REVIEW_PRIORITY',
        coverageStatus: 'ADEQUATE',
        factorScores: { severityScore: 35, confidenceScore: 25, recencyScore: 15, identityMatchScore: 10 },
        primaryRuleApplied: 'RULE_DEBARMENT_ACTIVE',
        dimensionCards: {} as any,
        briefSummary: { text: 'Debarment flag.', citedEvidenceIds: [], generatedBy: 'DETERMINISTIC_RULES' },
        unresolvedQueue: [],
        isStale: false,
        evaluatedAt: '2026-06-15T12:00:00.000Z',
      },
    },
    {
      id: 'inv_3',
      targetName: 'Zenith Global Procurement LLP',
      identifierType: 'GSTIN',
      identifierValue: '27AABCU9603R1ZM',
      status: 'PARTIAL_FAILURE',
      createdAt: '2026-07-01T09:00:00.000Z',
      requestedBy: 'Procurement Specialist',
      sourcesChecked: ['GSTN'],
      coverageGaps: ['Court litigation unavailable'],
      findingsCount: { verifiedClear: 0, caution: 0, materialRisk: 0, requiresReview: 0 },
      findings: [],
      relatedLeads: [],
      normalizedFindings: [],
      assessmentReport: {
        investigationId: 'inv_3',
        vendorId: 'ven_3',
        vendorName: 'Zenith Global Procurement LLP',
        explainableRiskScore: 40,
        reviewPriority: 'INSUFFICIENT_COVERAGE',
        overallReviewPriority: 'INSUFFICIENT_COVERAGE',
        coverageStatus: 'INADEQUATE',
        factorScores: { severityScore: 0, confidenceScore: 0, recencyScore: 0, identityMatchScore: 10 },
        primaryRuleApplied: 'RULE_INSUFFICIENT_COVERAGE',
        dimensionCards: {} as any,
        briefSummary: { text: 'Inadequate coverage.', citedEvidenceIds: [], generatedBy: 'DETERMINISTIC_RULES' },
        unresolvedQueue: [],
        isStale: false,
        evaluatedAt: '2026-07-01T09:00:00.000Z',
      },
    },
  ];

  logs.push('=== 1. TESTING VENDOR NAME SUBSTRING FILTER ===');
  const vendorRes = investigationFilterService.filterInvestigations(sampleInvestigations, { vendor: 'Tata' });
  assert(vendorRes.total === 1, 'Found exactly 1 investigation matching "Tata"');
  assert(vendorRes.items[0].id === 'inv_1', 'Matched Tata Steel');

  logs.push('=== 2. TESTING IDENTIFIER FILTER ===');
  const cinRes = investigationFilterService.filterInvestigations(sampleInvestigations, { identifier: '368940' });
  assert(cinRes.total === 1, 'Found 1 investigation by partial CIN substring');
  assert(cinRes.items[0].id === 'inv_2', 'Matched Apex Industrial CIN');

  logs.push('=== 3. TESTING STATUS FILTER ===');
  const statusRes = investigationFilterService.filterInvestigations(sampleInvestigations, { status: 'PARTIAL_FAILURE' });
  assert(statusRes.total === 1, 'Found 1 investigation with PARTIAL_FAILURE status');
  assert(statusRes.items[0].id === 'inv_3', 'Matched Zenith LLP');

  logs.push('=== 4. TESTING REVIEW PRIORITY FILTER ===');
  const priorityRes = investigationFilterService.filterInvestigations(sampleInvestigations, { reviewPriority: 'ELEVATED_REVIEW_PRIORITY' });
  assert(priorityRes.total === 1, 'Found 1 investigation with ELEVATED_REVIEW_PRIORITY');
  assert(priorityRes.items[0].id === 'inv_2', 'Matched Apex Industrial priority');

  logs.push('=== 5. TESTING DATE RANGE FILTER ===');
  const dateRes = investigationFilterService.filterInvestigations(sampleInvestigations, {
    dateFrom: '2026-06-01T00:00:00.000Z',
    dateTo: '2026-06-30T23:59:59.000Z',
  });
  assert(dateRes.total === 1, 'Date range 2026-06 returned exactly 1 investigation');
  assert(dateRes.items[0].id === 'inv_2', 'Matched June investigation');

  logs.push('=== 6. TESTING DIMENSION FILTER ===');
  const dimRes = investigationFilterService.filterInvestigations(sampleInvestigations, { dimension: 'blacklist_debarment' });
  assert(dimRes.total === 1, 'Found 1 investigation with blacklist_debarment finding');
  assert(dimRes.items[0].id === 'inv_2', 'Matched blacklist dimension');

  logs.push('=== 7. TESTING PAGINATION & CLAMPING ===');
  const pageRes = investigationFilterService.filterInvestigations(sampleInvestigations, { page: 1, limit: 2 });
  assert(pageRes.items.length === 2, 'Page limit correctly restricted items to 2');
  assert(pageRes.total === 3, 'Total count reflects 3 items');
  assert(pageRes.totalPages === 2, 'Total pages calculated as 2');

  return {
    success: assertionsFailed === 0,
    assertionsPassed,
    assertionsFailed,
    logs,
  };
}
