/**
 * VendorTrace Change Detection & Deterministic Signal Fingerprinting Test Suite
 * Tests deterministic hashing, first run baseline, unchanged runs, new items,
 * changed case status, disappeared records ('not observed in latest run'), and scheduling notices.
 */

import {
  changeDetectionService,
  computeSignalFingerprint,
  SCHEDULING_UNAVAILABLE_NOTICE,
} from '../services/changeDetectionService.js';
import { RiskFinding } from '../../types/riskFinding.js';

export async function runChangeDetectionTests(): Promise<{
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
  const earlier = new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(); // 14 days ago

  logs.push('=== 1. TESTING DETERMINISTIC SIGNAL FINGERPRINTING ===');

  // Test fingerprint invariance across scrape timestamps and ordering
  const fp1 = computeSignalFingerprint({
    entityIdentifier: 'U72900MH2021PTC368940',
    dimension: 'court_litigation',
    title: 'Commercial Suit for Recovery',
    referenceNumber: 'COM_CS_428_2024',
    sourceDomain: 'bombayhighcourt.nic.in',
    snippetKey: 'Summons issued on recovery petition for outstanding vendor dues.',
  });

  const fp2 = computeSignalFingerprint({
    entityIdentifier: 'u72900mh2021ptc368940', // lowercase
    dimension: 'COURT_LITIGATION', // uppercase
    title: ' Commercial Suit for Recovery ', // extra whitespace
    referenceNumber: 'com_cs_428_2024',
    sourceDomain: 'www.bombayhighcourt.nic.in', // with www prefix
    snippetKey: 'Summons issued on recovery petition for outstanding vendor dues.',
  });

  assert(fp1 === fp2, 'Fingerprints match identically regardless of casing, www prefix, or whitespace');

  // Test fingerprint difference when reference or dimension differs
  const fp3 = computeSignalFingerprint({
    entityIdentifier: 'U72900MH2021PTC368940',
    dimension: 'blacklist_debarment',
    title: 'Debarment Notice',
    referenceNumber: 'DEM_9912',
    sourceDomain: 'gem.gov.in',
    snippetKey: 'Vendor debarred for non-performance of delivery terms.',
  });

  assert(fp1 !== fp3, 'Different dimension/reference produces distinct deterministic fingerprint');

  logs.push('=== 2. TESTING FIRST RUN / BASELINE RUN ===');

  const baselineFinding: RiskFinding = {
    id: 'rf_base_01',
    dimension: 'court_litigation',
    title: 'Commercial Suit for Recovery',
    neutralSummary: 'Commercial summary suit pending before High Court.',
    status: 'signal_found',
    severity: 3,
    severityExplanation: 'Pending recovery claim.',
    evidence: [
      {
        id: 'evi_01',
        sourceName: 'Bombay High Court',
        sourceDomain: 'bombayhighcourt.nic.in',
        url: 'https://bombayhighcourt.nic.in/case/COM_CS_428_2024',
        snippet: 'Summons issued on recovery petition for outstanding vendor dues.',
        publishedAt: earlier,
        capturedAt: earlier,
        underlyingSource: 'High Court Docket',
        identityMatchNote: 'Exact match on corporate identifier',
        legalStatus: 'pending',
      },
    ],
    confidence: 'single_source_review',
    recommendedReviewAction: 'Request status affidavit from vendor.',
    createdAt: earlier,
  };

  const firstRunComparison = changeDetectionService.compareInvestigationRuns({
    vendorId: 'ven_test_01',
    vendorName: 'Apex Industrial Solutions Pvt Ltd',
    entityIdentifier: 'U72900MH2021PTC368940',
    previousInvestigationId: null,
    previousFindings: [],
    latestInvestigationId: 'inv_run_1',
    latestRunDate: earlier,
    latestFindings: [baselineFinding],
  });

  assert(firstRunComparison.newSignals.length === 1, 'First run detects all initial findings as new signals');
  assert(firstRunComparison.newSignals[0].diffType === 'NEW', 'Baseline signal marked with diffType NEW');
  assert(firstRunComparison.stats.isIdentical === false, 'First run is not marked identical');
  assert(firstRunComparison.schedulingNotice === SCHEDULING_UNAVAILABLE_NOTICE, 'First run includes honest scheduling notice');

  logs.push('=== 3. TESTING UNCHANGED RUN (ZERO DELTA) ===');

  // Re-run with identical finding data (simulating second run with same records)
  const unchangedComparison = changeDetectionService.compareInvestigationRuns({
    vendorId: 'ven_test_01',
    vendorName: 'Apex Industrial Solutions Pvt Ltd',
    entityIdentifier: 'U72900MH2021PTC368940',
    previousInvestigationId: 'inv_run_1',
    previousRunDate: earlier,
    previousFindings: [baselineFinding],
    latestInvestigationId: 'inv_run_2',
    latestRunDate: now,
    latestFindings: [
      {
        ...baselineFinding,
        id: 'rf_base_01_rerun', // new transient id, same substantive finding
        createdAt: now, // volatile timestamp changed
        evidence: [
          {
            ...baselineFinding.evidence[0],
            capturedAt: now, // scrape timestamp changed
          },
        ],
      },
    ],
  });

  assert(unchangedComparison.stats.isIdentical === true, 'Identical findings report zero delta despite changed scrape timestamps');
  assert(unchangedComparison.newSignals.length === 0, 'No new signals reported on identical re-run');
  assert(unchangedComparison.changedSignals.length === 0, 'No changed signals reported on identical re-run');
  assert(unchangedComparison.notObservedSignals.length === 0, 'No removed signals reported on identical re-run');

  logs.push('=== 4. TESTING NEW SIGNAL DETECTED ON RE-RUN ===');

  const newDebarmentFinding: RiskFinding = {
    id: 'rf_new_02',
    dimension: 'blacklist_debarment',
    title: 'Public Procurement Debarment',
    neutralSummary: 'Debarment notice recorded on public procurement portal for 6 months.',
    status: 'signal_found',
    severity: 4,
    severityExplanation: 'Active public procurement debarment.',
    evidence: [
      {
        id: 'evi_gem_01',
        sourceName: 'GeM Incident Management',
        sourceDomain: 'gem.gov.in',
        url: 'https://gem.gov.in/debarment/order/DEM_9912',
        snippet: 'Debarred for 180 days due to contract breach.',
        publishedAt: now,
        capturedAt: now,
        underlyingSource: 'GeM Debarment Registry',
        identityMatchNote: 'Exact match on corporate CIN',
        legalStatus: 'pending',
      },
    ],
    confidence: 'single_source_review',
    recommendedReviewAction: 'Escalate to procurement committee.',
    createdAt: now,
  };

  const newSignalComparison = changeDetectionService.compareInvestigationRuns({
    vendorId: 'ven_test_01',
    vendorName: 'Apex Industrial Solutions Pvt Ltd',
    entityIdentifier: 'U72900MH2021PTC368940',
    previousInvestigationId: 'inv_run_1',
    previousRunDate: earlier,
    previousFindings: [baselineFinding],
    latestInvestigationId: 'inv_run_3',
    latestRunDate: now,
    latestFindings: [baselineFinding, newDebarmentFinding],
  });

  assert(newSignalComparison.newSignals.length === 1, 'Detected exactly 1 new signal on re-run');
  assert(newSignalComparison.newSignals[0].title === 'Public Procurement Debarment', 'New signal title matches');
  assert(newSignalComparison.newSignals[0].statusBadge === 'New since previous check', 'New signal badge is "New since previous check"');
  assert(newSignalComparison.stats.totalNew === 1, 'Stats correctly tally 1 new signal');

  logs.push('=== 5. TESTING CHANGED CASE STATUS (PENDING -> SETTLED / DISMISSED) ===');

  const resolvedFinding: RiskFinding = {
    ...baselineFinding,
    severity: 1, // lowered severity upon disposal
    evidence: [
      {
        ...baselineFinding.evidence[0],
        legalStatus: 'settled',
        snippet: 'Suit disposed as settled pursuant to consent terms filed by parties.',
        publishedAt: now,
      },
    ],
  };

  const statusChangedComparison = changeDetectionService.compareInvestigationRuns({
    vendorId: 'ven_test_01',
    vendorName: 'Apex Industrial Solutions Pvt Ltd',
    entityIdentifier: 'U72900MH2021PTC368940',
    previousInvestigationId: 'inv_run_1',
    previousRunDate: earlier,
    previousFindings: [baselineFinding],
    latestInvestigationId: 'inv_run_4',
    latestRunDate: now,
    latestFindings: [resolvedFinding],
  });

  assert(statusChangedComparison.changedSignals.length === 1, 'Changed legal status detected in changed signals');
  assert(statusChangedComparison.changedSignals[0].diffType === 'RESOLVED_BY_SOURCE', 'Explicit disposal classified as RESOLVED_BY_SOURCE');
  assert(statusChangedComparison.changedSignals[0].statusBadge === 'Resolved by Source', 'Status badge indicates Resolved by Source');
  const legalChange = statusChangedComparison.changedSignals[0].changes.find((c) => c.field === 'legalDisputeStatus');
  assert(legalChange !== undefined && legalChange.previousValue === 'pending' && legalChange.currentValue === 'settled', 'Legal dispute status transitioned pending -> settled');

  logs.push('=== 6. TESTING DISAPPEARED RECORD (NOT OBSERVED IN LATEST RUN) ===');

  // Baseline has finding, latest run has NO findings (e.g. search engine or registry dropped snippet)
  const disappearedComparison = changeDetectionService.compareInvestigationRuns({
    vendorId: 'ven_test_01',
    vendorName: 'Apex Industrial Solutions Pvt Ltd',
    entityIdentifier: 'U72900MH2021PTC368940',
    previousInvestigationId: 'inv_run_1',
    previousRunDate: earlier,
    previousFindings: [baselineFinding],
    latestInvestigationId: 'inv_run_5',
    latestRunDate: now,
    latestFindings: [],
  });

  assert(disappearedComparison.notObservedSignals.length === 1, 'Record not observed in latest run recorded in notObservedSignals');
  assert(disappearedComparison.notObservedSignals[0].diffType === 'NOT_OBSERVED_IN_LATEST', 'Classified as NOT_OBSERVED_IN_LATEST, NOT clean or resolved');
  assert(disappearedComparison.notObservedSignals[0].statusBadge === 'Not observed in latest check', 'Status badge is "Not observed in latest check"');
  assert(disappearedComparison.notObservedSignals[0].explanation.includes('Zero-fabrication rule'), 'Explanation enforces zero-fabrication rule (absence does not equal clearance)');

  logs.push('=== 7. TESTING MONITORING PREFERENCE CONFIGURATION & SCHEDULING NOTICE ===');

  const config = changeDetectionService.getMonitoringConfig('ven_test_01');
  assert(config.status === 'SCHEDULING_NOT_ENABLED_IN_THIS_DEPLOYMENT', 'Monitoring status explicitly declares scheduling not enabled');
  assert(config.notice.includes('Scheduling not enabled'), 'Config notice contains explicit manual-only restriction');

  const updatedConfig = changeDetectionService.setMonitoringPreference('ven_test_01', 'WEEKLY');
  assert(updatedConfig.preference === 'WEEKLY', 'Preference saved');
  assert(updatedConfig.status === 'SCHEDULING_NOT_ENABLED_IN_THIS_DEPLOYMENT', 'Status remains SCHEDULING_NOT_ENABLED_IN_THIS_DEPLOYMENT');
  assert(updatedConfig.nextScheduledCheck === null, 'nextScheduledCheck remains null since no scheduler is active');

  return {
    success: assertionsFailed === 0,
    assertionsPassed,
    assertionsFailed,
    logs,
  };
}
