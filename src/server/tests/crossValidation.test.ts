/**
 * Layer 3 Cross-Validation & Deterministic Scoring Test Suite
 * Tests one vs two independent sources, syndicated copies, conflicting evidence,
 * weak identity match, stale data, no evidence, unavailable dimension, and score calculation.
 */

import { crossValidationService } from '../services/crossValidationService.js';
import { RiskFinding } from '../../types/riskFinding.js';

export async function runCrossValidationTests(): Promise<{
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

  const now = new Date().toISOString();

  logs.push('=== 1. TESTING ONE VS TWO INDEPENDENT SOURCES ===');
  // Single Source Finding
  const singleFinding: RiskFinding = {
    id: 'rf_test_1',
    dimension: 'court_litigation',
    title: 'Pending Recovery Suit',
    neutralSummary: 'Commercial summary suit pending before High Court.',
    status: 'signal_found',
    severity: 3,
    severityExplanation: 'Pending commercial suit.',
    evidence: [
      {
        id: 'evi_hc_01',
        sourceName: 'High Court Commercial Division',
        sourceDomain: 'bombayhighcourt.nic.in',
        url: 'https://bombayhighcourt.nic.in/case/1',
        snippet: 'Summons issued on commercial recovery petition.',
        publishedAt: '2026-05-01T00:00:00.000Z',
        capturedAt: now,
        underlyingSource: 'High Court Docket',
        identityMatchNote: 'Exact Name',
        legalStatus: 'pending',
      },
    ],
    confidence: 'single_source_review',
    recommendedReviewAction: 'Request status affidavit.',
    createdAt: now,
  };

  const validatedSingle = crossValidationService.crossValidateFinding(singleFinding, 'EXACT_IDENTIFIER');
  assert(validatedSingle.confidence === 'single_source_review', 'Assigns single_source_review when supported by 1 source');
  assert(validatedSingle.needsHumanReview, 'Correctly flags single-source finding as needing human review');
  assert(validatedSingle.sourcesCounted.length === 1, 'Records exactly 1 counted source');

  // Two Independent Sources Finding
  const dualFinding: RiskFinding = {
    ...singleFinding,
    id: 'rf_test_2',
    evidence: [
      singleFinding.evidence[0],
      {
        id: 'evi_trib_02',
        sourceName: 'National Company Law Tribunal (NCLT)',
        sourceDomain: 'nclt.gov.in',
        url: 'https://nclt.gov.in/orders/case-123',
        snippet: 'Operational creditor demand notice recorded.',
        publishedAt: '2026-05-02T00:00:00.000Z',
        capturedAt: now,
        underlyingSource: 'NCLT Orders Portal',
        identityMatchNote: 'Exact 21-character CIN match',
        legalStatus: 'pending',
      },
    ],
  };

  const validatedDual = crossValidationService.crossValidateFinding(dualFinding, 'EXACT_IDENTIFIER');
  assert(validatedDual.confidence === 'multiple_independent_sources', 'Upgrades to multiple_independent_sources when 2 distinct independent domains corroborate');
  assert(validatedDual.sourcesCounted.length === 2, 'Counts 2 distinct non-syndicated sources');

  logs.push('\n=== 2. TESTING SYNDICATED WIRE COPIES (DO NOT COUNT AS INDEPENDENT) ===');
  const syndicatedFinding: RiskFinding = {
    id: 'rf_test_pr',
    dimension: 'negative_news',
    title: 'Board Audit Inquiry Press Coverage',
    neutralSummary: 'Media reports on audit restructuring.',
    status: 'signal_found',
    severity: 2,
    severityExplanation: 'Governance review.',
    evidence: [
      {
        id: 'evi_ani_01',
        sourceName: 'ANI News Wire',
        sourceDomain: 'aninews.in',
        url: 'https://aninews.in/news/pr-1',
        snippet: 'Company issues official statement regarding board review.',
        publishedAt: '2026-07-01T00:00:00.000Z',
        capturedAt: now,
        underlyingSource: 'Press Release Wire',
        identityMatchNote: 'Exact Name',
        isPressReleaseRepetition: true,
      },
      {
        // Syndicated copy on another domain
        id: 'evi_bs_02',
        sourceName: 'Business Standard Syndicated Wire Feed',
        sourceDomain: 'business-standard.com',
        url: 'https://business-standard.com/syndicated-pr-1',
        snippet: 'Company issues official statement regarding board review.',
        publishedAt: '2026-07-01T00:00:00.000Z',
        capturedAt: now,
        underlyingSource: 'ANI Wire Syndication',
        identityMatchNote: 'Exact Name',
        isPressReleaseRepetition: true,
      },
    ],
    confidence: 'single_source_review',
    recommendedReviewAction: 'Review official disclosures.',
    createdAt: now,
  };

  const validatedSyndicated = crossValidationService.crossValidateFinding(syndicatedFinding, 'EXACT_IDENTIFIER');
  assert(
    validatedSyndicated.confidence === 'single_source_review',
    'Syndicated wire copies on different domains do NOT count as multiple independent sources'
  );
  assert(
    validatedSyndicated.syndicatedOrExcludedSources.length === 2,
    'Tracks syndicated copies in syndicatedOrExcludedSources'
  );

  logs.push('\n=== 3. TESTING CONFLICTING CREDIBLE EVIDENCE ===');
  const conflictingFinding: RiskFinding = {
    id: 'rf_conflict',
    dimension: 'company_registry',
    title: 'Discrepancy in Registered Company Status',
    neutralSummary: 'MCA21 lists status as ACTIVE while regional gazette reports striking off.',
    status: 'conflicting_evidence',
    severity: 3,
    severityExplanation: 'Conflicting registry status.',
    evidence: singleFinding.evidence,
    confidence: 'conflicting_sources',
    recommendedReviewAction: 'Reconcile with official RoC filing records.',
    createdAt: now,
  };

  const validatedConflict = crossValidationService.crossValidateFinding(conflictingFinding, 'EXACT_IDENTIFIER');
  assert(validatedConflict.confidence === 'conflicting_sources', 'Labels conflicting claims as conflicting_sources');
  assert(validatedConflict.needsHumanReview, 'Requires human review for conflicting evidence');

  logs.push('\n=== 4. TESTING WEAK IDENTITY MATCH ===');
  const validatedWeak = crossValidationService.crossValidateFinding(dualFinding, 'WEAK');
  assert(
    validatedWeak.confidence === 'insufficient_evidence',
    'Weak entity match downgrades confidence to insufficient_evidence regardless of source count'
  );

  logs.push('\n=== 5. TESTING STALE DATA DETECTION ===');
  const staleDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(); // 45 days ago
  const staleReport = await crossValidationService.compileAssessmentReport({
    investigationId: 'inv_stale',
    vendorId: 'ven_test',
    vendorName: 'STALE VENDOR TEST LTD',
    cin: 'L27100MH1907PLC000260',
    gstin: '27AAACT2727Q1ZW',
    pan: 'AAACT2727Q',
    identityMatchQuality: 'EXACT_IDENTIFIER',
    rawFindings: [validatedSingle],
    coverageGaps: [],
    dimensionTaskStates: {
      company_registry: { status: 'completed' },
      gst_compliance: { status: 'completed' },
      court_litigation: { status: 'completed' },
      blacklist_debarment: { status: 'completed' },
      negative_news: { status: 'completed' },
    },
    investigationDate: staleDate,
    sourcesChecked: ['MCA21', 'GSTN', 'E-Courts', 'GeM'],
  });

  assert(staleReport.isStale === true, 'Accurately flags investigations older than 30 days as stale');
  assert(staleReport.staleNotice !== undefined, 'Provides actionable stale notice');

  logs.push('\n=== 6. TESTING NO EVIDENCE (CLEAN ENTITY) ===');
  const cleanFinding: RiskFinding = {
    id: 'rf_clean',
    dimension: 'blacklist_debarment',
    title: 'No Debarment Found in Checked Registers',
    neutralSummary: 'Zero debarment entries identified.',
    status: 'no_signal_found_in_checked_sources',
    severity: 1,
    severityExplanation: 'No signals found.',
    evidence: [],
    confidence: 'single_source_review',
    recommendedReviewAction: 'Periodic re-check.',
    createdAt: now,
  };

  const cleanReport = await crossValidationService.compileAssessmentReport({
    investigationId: 'inv_clean',
    vendorId: 'ven_clean',
    vendorName: 'CLEAN SUPPLIER LTD',
    cin: 'L27100MH1907PLC000260',
    gstin: '27AAACT2727Q1ZW',
    pan: 'AAACT2727Q',
    identityMatchQuality: 'EXACT_IDENTIFIER',
    rawFindings: [cleanFinding],
    coverageGaps: [],
    dimensionTaskStates: {
      company_registry: { status: 'completed' },
      gst_compliance: { status: 'completed' },
      court_litigation: { status: 'completed' },
      blacklist_debarment: { status: 'completed' },
      negative_news: { status: 'completed' },
    },
    investigationDate: now,
    sourcesChecked: ['MCA21', 'GSTN', 'GeM', 'CVC'],
  });

  assert(cleanReport.reviewPriority === 'STANDARD_PERIODIC_REVIEW', 'Clean vendor receives STANDARD_PERIODIC_REVIEW');
  assert(cleanReport.scoreBreakdown!.totalScore < 30, 'Low risk score for clean vendor');
  assert(cleanReport.fourDimensionCards!.blacklist_debarment.status === 'no_signal_found_in_checked_sources', 'Dimension card marked as no_signal_found_in_checked_sources');
  assert(cleanReport.coverageStatus === 'COMPLETE', 'All four core dimensions complete produces COMPLETE coverage');

  const queuedNewsReport = await crossValidationService.compileAssessmentReport({
    investigationId: 'inv_queued_news',
    vendorId: 'ven_queued_news',
    vendorName: 'QUEUED NEWS CHECK LTD',
    cin: 'L27100MH1907PLC000260',
    gstin: '27AAACT2727Q1ZW',
    pan: 'AAACT2727Q',
    identityMatchQuality: 'EXACT_IDENTIFIER',
    rawFindings: [],
    coverageGaps: [],
    dimensionTaskStates: {
      company_registry: { status: 'completed' },
      gst_compliance: { status: 'completed' },
      court_litigation: { status: 'completed' },
      blacklist_debarment: { status: 'completed' },
      negative_news: { status: 'queued' },
    },
    investigationDate: now,
    sourcesChecked: ['MCA21', 'GSTN', 'E-Courts', 'GeM'],
  });
  assert(queuedNewsReport.coverageStatus === 'PARTIAL', 'Queued adverse-media task prevents a false COMPLETE 4/4 coverage label');
  assert(queuedNewsReport.coverageGaps?.length === 0, 'Queued task is not fabricated into a provider error or an evidence finding');

  logs.push('\n=== 7. TESTING UNAVAILABLE DIMENSION & INSUFFICIENT COVERAGE ===');
  // Scenario: 3 of 4 dimensions failed/unavailable
  const inadequateReport = await crossValidationService.compileAssessmentReport({
    investigationId: 'inv_inadequate',
    vendorId: 'ven_inadequate',
    vendorName: 'UNAVAILABLE PORTALS LTD',
    cin: null,
    gstin: null,
    pan: null,
    identityMatchQuality: 'WEAK',
    rawFindings: [],
    coverageGaps: ['MCA21 unavailable', 'E-Courts unavailable', 'GeM unavailable'],
    dimensionTaskStates: {
      company_registry: { status: 'unavailable' },
      gst_compliance: { status: 'unavailable' },
      court_litigation: { status: 'failed' },
      blacklist_debarment: { status: 'completed' },
      negative_news: { status: 'unavailable' },
    },
    investigationDate: now,
    sourcesChecked: ['GeM'],
  });

  assert(inadequateReport.coverageStatus === 'INADEQUATE', 'Coverage status is strictly INADEQUATE');
  assert(
    inadequateReport.reviewPriority === 'INSUFFICIENT_COVERAGE',
    'Assigns INSUFFICIENT_COVERAGE instead of a false low-risk score'
  );
  assert(
    inadequateReport.scoreBreakdown!.ruleApplied.includes('Inadequate Registry Coverage'),
    'Exposes deterministic rule explaining why low risk was NOT assigned'
  );

  logs.push('\n=== 8. TESTING DETERMINISTIC SCORE CALCULATION & CITATIONS ===');
  // High Risk Corroborated Finding
  const highRiskFinding: RiskFinding = {
    id: 'rf_high',
    dimension: 'blacklist_debarment',
    title: 'Confirmed GeM Debarment Order',
    neutralSummary: 'Debarment order issued under public procurement rules.',
    status: 'signal_found',
    severity: 5,
    severityExplanation: 'Critical administrative embargo.',
    evidence: [
      {
        id: 'evi_gem_1',
        sourceName: 'GeM Debarment Portal',
        sourceDomain: 'gem.gov.in',
        url: 'https://gem.gov.in/order/99',
        snippet: 'Vendor debarred from participating in central tenders for 12 months.',
        publishedAt: now,
        capturedAt: now,
        underlyingSource: 'GeM Public Order',
        identityMatchNote: 'Exact CIN match',
        legalStatus: 'confirmed',
      },
      {
        id: 'evi_cvc_2',
        sourceName: 'Central Vigilance Commission Gazette',
        sourceDomain: 'cvc.gov.in',
        url: 'https://cvc.gov.in/gazette/99',
        snippet: 'Debarment notification published in official vigilance gazette.',
        publishedAt: now,
        capturedAt: now,
        underlyingSource: 'CVC Gazette',
        identityMatchNote: 'Exact CIN match',
        legalStatus: 'confirmed',
      },
    ],
    confidence: 'multiple_independent_sources',
    recommendedReviewAction: 'Immediate procurement embargo.',
    createdAt: now,
  };

  const highReport = await crossValidationService.compileAssessmentReport({
    investigationId: 'inv_high',
    vendorId: 'ven_high',
    vendorName: 'HIGH RISK EMBARGO LTD',
    cin: 'L27100MH1907PLC000260',
    gstin: '27AAACT2727Q1ZW',
    pan: 'AAACT2727Q',
    identityMatchQuality: 'EXACT_IDENTIFIER',
    rawFindings: [highRiskFinding],
    coverageGaps: [],
    dimensionTaskStates: {
      company_registry: { status: 'completed' },
      gst_compliance: { status: 'completed' },
      court_litigation: { status: 'completed' },
      blacklist_debarment: { status: 'completed' },
      negative_news: { status: 'completed' },
    },
    investigationDate: now,
    sourcesChecked: ['GeM', 'CVC', 'MCA21', 'GSTN'],
  });

  assert(highReport.reviewPriority === 'ELEVATED_REVIEW_PRIORITY', 'Assigns ELEVATED_REVIEW_PRIORITY');
  assert(highReport.scoreBreakdown!.totalScore >= 70, `Score is elevated (${highReport.scoreBreakdown!.totalScore}/100)`);
  assert(highReport.scoreBreakdown!.severityPoints === 40, 'Allocates maximum 40 severity points for severity 5');
  assert(highReport.briefSummary.citedEvidenceIds.includes('evi_gem_1'), 'Brief summary cites exact evidence ID [evi_gem_1]');

  return {
    success: assertionsFailed === 0,
    assertionsPassed,
    assertionsFailed,
    logs,
  };
}
