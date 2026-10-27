/**
 * Layer 1 Discovery Orchestration Test Suite
 * Tests concurrent multi-dimension execution, failure isolation, timeout handling,
 * partial reports, duplicate evidence deduplication, and no-results handling.
 */

import { discoveryService } from '../services/discoveryService.js';
import { tinyfish } from '../providers/tinyfish.js';
import { indiacos } from '../providers/indiacos.js';
import { deduplicateLitigationCases } from '../services/litigationCaseUtils.js';

export async function runDiscoveryOrchestrationTests(): Promise<{
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

  const duplicateCase = {
    caseId: 'case-001', caseTitle: 'Commercial Suit', caseNumber: 'CS 1/2024', courtName: 'Delhi High Court',
    petitioner: 'Tata Steel Limited', respondent: 'Example Supplier', parties: ['Tata Steel Limited', 'Example Supplier'], status: 'pending' as const,
  };
  const distinctSameTitleCase = { ...duplicateCase, caseId: 'case-002', caseNumber: 'CS 2/2024' };
  const dedupedCases = deduplicateLitigationCases([duplicateCase, { ...duplicateCase }, distinctSameTitleCase]);
  assert(dedupedCases.length === 2, 'Case deduplication removes duplicate provider IDs while preserving distinct case numbers with the same title');
  assert(deduplicateLitigationCases([{ caseTitle: 'Similar title', courtName: 'Delhi High Court', status: 'unknown' }, { caseTitle: 'Similar title', courtName: 'Delhi High Court', status: 'unknown' }]).length === 2,
    'Cases without a stable ID or full composite are not merged based on title alone');
  assert(deduplicateLitigationCases([
    { caseNumber: 'CS 3/2024', courtName: 'Delhi High Court', parties: ['Vendor A', 'Vendor B'], status: 'unknown' },
    { caseNumber: ' CS 3 / 2024 ', courtName: 'DELHI HIGH COURT', parties: ['vendor b', 'vendor a'], status: 'unknown' },
  ]).length === 1, 'Stable composite case number, court, and normalized parties deduplicate equivalent provider rows');

  const originalConfigured = indiacos.isConfigured;
  const originalLookupCases = indiacos.lookupCases;
  const originalTinyfishConfigured = tinyfish.isConfigured;
  try {
    (indiacos as any).isConfigured = () => true;
    (indiacos as any).lookupCases = async () => ({
      success: true,
      status: 'LIVE',
      isMock: true,
      cases: [{ caseId: 'case-general-url', caseNumber: 'CS 9/2026', caseTitle: 'Commercial dispute', courtName: 'Delhi High Court', petitioner: 'TATA STEEL LIMITED', respondent: 'Example Ltd', parties: ['TATA STEEL LIMITED', 'Example Ltd'], status: 'pending', sourceUrl: 'https://indiacos.com/company/L27100MH1907PLC000260' }],
    });
    (tinyfish as any).isConfigured = () => false;
    const caseReport = await (discoveryService as any).runLitigationDimension({ canonicalName: 'TATA STEEL LIMITED', cin: 'L27100MH1907PLC000260' }, false, '', new AbortController().signal);
    const caseEvidence = caseReport.findings[0]?.evidence[0];
    assert(caseEvidence?.url === null, 'General company-profile URL is not reused as a case-specific court source');
    assert(/No case-specific source URL was supplied/.test(caseEvidence?.identityMatchNote || '') && caseReport.findings[0]?.status === 'inconclusive', 'Case without a direct docket URL stays unverified and requires human review');
  } finally {
    (indiacos as any).isConfigured = originalConfigured;
    (indiacos as any).lookupCases = originalLookupCases;
    (tinyfish as any).isConfigured = originalTinyfishConfigured;
  }

  logs.push('=== TEST 1: ALL-SUCCESS SCENARIO (ALL 4 DIMENSIONS COMPLETED) ===');
  const vendor = {
    canonicalName: 'TATA STEEL LIMITED',
    cin: 'L27100MH1907PLC000260',
    gstin: '27AAACT2727Q1ZW',
    pan: 'AAACT2727Q',
  };

  const originalConfiguredForGst = indiacos.isConfigured;
  const originalLookupByCinForGst = indiacos.lookupByCIN;
  const originalLookupByGstin = indiacos.lookupByGSTIN;
  try {
    (indiacos as any).isConfigured = () => true;
    (indiacos as any).lookupByCIN = async () => ({
      success: true,
      status: 'LIVE',
      isMock: true,
      profile: { canonicalName: vendor.canonicalName, cin: vendor.cin, gstins: ['27AAACT2727Q1ZW'], companyStatus: 'ACTIVE', sourceUrl: 'https://indiacos.com/company/L27100MH1907PLC000260' },
    });
    (indiacos as any).lookupByGSTIN = async (gstin: string) => ({
      success: gstin === '27AAACT2727Q1ZW',
      status: 'LIVE',
      isMock: true,
      profile: { canonicalName: vendor.canonicalName, cin: vendor.cin, gstins: [gstin], companyStatus: 'ACTIVE', sourceUrl: 'https://services.gst.gov.in/services/searchtp' },
    });
    const resolvedGstTask = await (discoveryService as any).runGstComplianceDimension(
      { canonicalName: vendor.canonicalName, cin: vendor.cin }, false, '', new AbortController().signal, true,
    );
    assert(resolvedGstTask.status === 'completed' && resolvedGstTask.findings.some((finding: any) => finding.evidence[0].snippet.includes('27AAACT2727Q1ZW')), 'GST workstream resolves a GSTIN from the validated CIN company profile and completes the GSTN lookup');
  } finally {
    (indiacos as any).isConfigured = originalConfiguredForGst;
    (indiacos as any).lookupByCIN = originalLookupByCinForGst;
    (indiacos as any).lookupByGSTIN = originalLookupByGstin;
  }

  const allSuccessReport = await discoveryService.runDiscovery(vendor, {
    useMock: true,
    mockScenario: 'ALL_SUCCESS',
    maxConcurrency: 3,
    overallTimeoutMs: 15000,
    dimensionTimeoutMs: 5000,
  });

  assert(allSuccessReport.status === 'completed', 'Overall investigation status is COMPLETED');
  assert(allSuccessReport.findings.length > 0, `Generated ${allSuccessReport.findings.length} findings across dimensions`);
  assert(allSuccessReport.totalSourcesChecked > 0, `Audited ${allSuccessReport.totalSourcesChecked} sources`);
  assert(allSuccessReport.coverageGaps.some((gap) => /Synthetic demo mode/.test(gap)), 'Offline all-success scenario explicitly disclaims live-source coverage');
  assert(allSuccessReport.findings.every((finding) => finding.evidence.every((evidence) => evidence.sourceDomain.endsWith('.invalid'))), 'All offline demo evidence domains use reserved .invalid hosts');
  assert(allSuccessReport.findings.every((finding) => finding.neutralSummary.startsWith('SYNTHETIC DEMO ONLY')), 'Offline findings are explicitly labeled synthetic in report text');
  assert(allSuccessReport.dimensions.company_registry.status === 'completed', 'Company registry dimension completed');
  assert(allSuccessReport.dimensions.gst_compliance.status === 'completed', 'GST compliance dimension completed');
  assert(allSuccessReport.dimensions.court_litigation.status === 'completed', 'Court litigation dimension completed');
  assert(allSuccessReport.dimensions.blacklist_debarment.status === 'completed', 'Blacklist/debarment dimension completed');
  assert(allSuccessReport.dimensions.negative_news.status === 'completed', 'Negative news dimension completed');
  assert(typeof allSuccessReport.dimensions.company_registry.durationMs === 'number', 'Reports measured durationMs for dimension');

  logs.push('\n=== TEST 2: PARTIAL-FAILURE SCENARIO (FAILURE ISOLATION) ===');
  // Debarment portal fails, but the other dimensions must succeed
  const partialReport = await discoveryService.runDiscovery(vendor, {
    useMock: true,
    mockScenario: 'PARTIAL_FAILURE_DEBARMENT_FAIL',
    maxConcurrency: 2,
    dimensionTimeoutMs: 3000,
  });

  assert(partialReport.status === 'partial_failure', 'Investigation reports PARTIAL_FAILURE status');
  assert(partialReport.dimensions.blacklist_debarment.status === 'failed', 'Failing dimension is marked as FAILED');
  assert(partialReport.dimensions.blacklist_debarment.errorCategory === 'TIMEOUT', 'Failed dimension records safe errorCategory TIMEOUT');
  assert(partialReport.dimensions.company_registry.status === 'completed', 'Non-failing dimensions completed successfully (isolated)');
  assert(partialReport.coverageGaps.length > 0, 'Coverage gap explicitly listed in report summary');
  assert(partialReport.summary.narrative.includes('gap'), 'Narrative includes explicit coverage gap notice');

  logs.push('\n=== TEST 3: TIMEOUT SCENARIO (DIMENSION DEADLINE ENFORCEMENT) ===');
  // Configure tight 50ms timeout against 300ms mock delay to trigger simulated timeout
  const timeoutReport = await discoveryService.runDiscovery(vendor, {
    useMock: true,
    mockScenario: 'TIMEOUT',
    dimensionTimeoutMs: 50,
  });

  assert(timeoutReport.status === 'partial_failure' || timeoutReport.status === 'failed', 'Handles timeout gracefully without crashing');
  assert(timeoutReport.coverageGaps.some((g) => g.toLowerCase().includes('time') || g.toLowerCase().includes('fail')), 'Logs timeout error category and coverage gap');

  logs.push('\n=== TEST 4: DUPLICATE EVIDENCE & PRESS RELEASE SYNDICATION ===');
  const duplicateReport = await discoveryService.runDiscovery(vendor, {
    useMock: true,
    mockScenario: 'DUPLICATE_EVIDENCE',
  });

  const newsFinding = duplicateReport.findings.find((f) => f.dimension === 'negative_news');
  assert(Boolean(newsFinding), 'Negative news finding generated');
  if (newsFinding) {
    // 3 evidence items provided in mock, but 2 are duplicate URL / syndicated wire copies
    assert(newsFinding.evidence.length <= 2, `Evidence deduplicated down to ${newsFinding.evidence.length} items`);
    assert(newsFinding.evidence.some((e) => e.isPressReleaseRepetition), 'Flags syndicated press release repetition');
  }

  logs.push('\n=== TEST 5: NO-RESULTS SCENARIO (ZERO-FABRICATION RULE) ===');
  const cleanVendor = {
    canonicalName: 'CLEAN SUPPLIER SOLUTIONS PVT LTD',
    cin: 'U72900KA2020PTC139000',
    gstin: '29ABCDE1234F1Z5',
  };

  const noResultsReport = await discoveryService.runDiscovery(cleanVendor, {
    useMock: true,
    mockScenario: 'NO_RESULTS',
  });

  assert(noResultsReport.status === 'completed', 'Clean vendor completed with status COMPLETED');
  const debarmentFinding = noResultsReport.findings.find((f) => f.dimension === 'blacklist_debarment');
  assert(Boolean(debarmentFinding), 'Debarment finding generated for clean vendor');
  if (debarmentFinding) {
    assert(
      debarmentFinding.status === 'no_signal_found_in_checked_sources',
      "Properly labels status as 'no_signal_found_in_checked_sources' (not manufactured clean certification)"
    );
    assert(debarmentFinding.severity === 1, 'Severity 1 (Info / No Signal Found)');
    assert(!debarmentFinding.neutralSummary.includes('guarantee'), 'Does not claim absolute guarantee of innocence');
  }

  logs.push('\n=== TEST 6: LIVE LIMITS, CANCELLATION, AND HONEST COVERAGE ===');
  const originalApiKey = process.env.TINYFISH_API_KEY;
  const originalIndiaCosApiKey = process.env.INDIACOS_API_KEY;
  const originalDebarmentSearch = tinyfish.searchDebarment;
  const originalMediaSearch = tinyfish.searchAdverseMedia;
  const originalLitigationSearch = tinyfish.searchLitigationContext;
  const originalCINLookup = indiacos.lookupByCIN;
  const originalGSTLookup = indiacos.lookupByGSTIN;
  const originalCasesLookup = indiacos.lookupCases;
  const emptySearchResult = { success: true, status: 'LIVE' as const, articles: [], isMock: false };
  process.env.TINYFISH_API_KEY = 'test-only-key';
  delete process.env.INDIACOS_API_KEY;
  tinyfish.searchAdverseMedia = async () => emptySearchResult;
  tinyfish.searchLitigationContext = async () => emptySearchResult;

  try {
    tinyfish.searchDebarment = async () => emptySearchResult;
    const missingIndiaCosReport = await discoveryService.runDiscovery(vendor, {
      useMock: false,
      overallTimeoutMs: 1000,
      dimensionTimeoutMs: 100,
      maxAttempts: 1,
    });
    assert(missingIndiaCosReport.dimensions.company_registry.status === 'unavailable', 'Missing IndiaCos credentials mark registry task unavailable');
    assert(missingIndiaCosReport.dimensions.gst_compliance.status === 'unavailable', 'Missing IndiaCos credentials mark GST task unavailable');
    assert(missingIndiaCosReport.dimensions.company_registry.sourcesChecked.length === 0, 'Unconfigured registry source is not counted as checked');
    assert(missingIndiaCosReport.coverageStatus === 'PARTIAL', 'Unavailable required dimensions produce partial coverage');
    assert(missingIndiaCosReport.status === 'partial_failure', 'Live report with unavailable required dimensions is not reported fully completed');
    assert(missingIndiaCosReport.summary.verdict !== 'VERIFIED_CLEAR', 'Partial coverage without validated adverse evidence is not reported as verified clear');
    assert(!missingIndiaCosReport.findings.some((finding) => finding.dimension === 'company_registry' || finding.dimension === 'gst_compliance'), 'Missing provider credentials cannot create verified registry or GST findings');

    process.env.INDIACOS_API_KEY = 'test-only-indiacos-key';
    const indiaCosCalls: string[] = [];
    const profile = {
      canonicalName: vendor.canonicalName,
      cin: vendor.cin,
      gstins: [vendor.gstin],
      companyStatus: 'Active',
      entityType: 'COMPANY' as const,
      lastFetchedAt: new Date().toISOString(),
      identityMatchMethod: 'EXACT_CIN' as const,
      isCached: false,
    };
    indiacos.lookupByCIN = async () => { indiaCosCalls.push('company'); return { success: true, status: 'LIVE', profile, isMock: false }; };
    indiacos.lookupByGSTIN = async () => { indiaCosCalls.push('gst'); return { success: true, status: 'LIVE', profile: { ...profile, identityMatchMethod: 'EXACT_GSTIN' }, isMock: false }; };
    indiacos.lookupCases = async (_id, options) => { indiaCosCalls.push(`cases:${options?.identifierType}`); return { success: true, status: 'LIVE', cases: [duplicateCase, { ...duplicateCase }, distinctSameTitleCase], isMock: false }; };
    const integratedReport = await discoveryService.runDiscovery(vendor, { overallTimeoutMs: 1000, dimensionTimeoutMs: 500, maxAttempts: 1 });
    assert(indiaCosCalls.includes('company') && indiaCosCalls.includes('gst'), 'Eligible live investigation invokes IndiaCos company and GST lookups');
    assert(indiaCosCalls.includes('cases:CIN') && indiaCosCalls.includes('cases:GSTIN'), 'Eligible live investigation queries documented CIN and GSTIN case endpoints');
    assert(integratedReport.dimensions.negative_news.provider.includes('TinyFish'), 'Adverse-media task runs independently through the TinyFish provider');
    assert(integratedReport.dimensions.company_registry.findings[0]?.status === 'inconclusive' && integratedReport.dimensions.company_registry.findings[0]?.evidence[0]?.sourceName.includes('IndiaCos'), 'Active company status is informational and explicitly attributed to IndiaCos');
    const courtCandidates = integratedReport.dimensions.court_litigation.findings;
    assert(courtCandidates.length === 2, 'Orchestrated court results deduplicate exact duplicate records but retain distinct cases with similar titles');
    assert(courtCandidates.every((finding) => finding.status === 'inconclusive' && finding.severity === 1), 'IndiaCos case-name matches remain unverified candidates, not risk signals');
    assert(Boolean(courtCandidates[0]?.evidence[0]?.caseNumber && courtCandidates[0]?.evidence[0]?.caseRespondent), 'Case-specific number and party fields are preserved in evidence');

    tinyfish.searchAdverseMedia = async () => ({
      success: true,
      status: 'LIVE',
      articles: [{ title: 'Tata Steel shareholder amalgamation notice', url: 'https://example.com/notice/1', sourceDomain: 'example.com', snippet: 'TATA STEEL LIMITED published a routine shareholder and amalgamation administrative notice.', retrievedAt: new Date().toISOString() }],
      isMock: false,
    });
    const neutralMediaReport = await discoveryService.runDiscovery(vendor, { overallTimeoutMs: 1000, dimensionTimeoutMs: 500, maxAttempts: 1 });
    assert(!neutralMediaReport.dimensions.negative_news.findings.some((finding) => finding.status === 'signal_found'), 'Routine shareholder and amalgamation notices are excluded from adverse-media signals');

    tinyfish.searchAdverseMedia = async () => ({
      success: true,
      status: 'LIVE',
      articles: [{ title: 'TATA STEEL LIMITED investigated for alleged fraud', url: 'https://example.com/news/1', sourceDomain: 'example.com', snippet: 'TATA STEEL LIMITED was investigated for alleged fraud.', expandedText: 'TATA STEEL LIMITED was investigated for alleged fraud.', retrievedAt: new Date().toISOString() }],
      isMock: false,
    });
    const nameOnlyMediaReport = await discoveryService.runDiscovery(vendor, { overallTimeoutMs: 1000, dimensionTimeoutMs: 500, maxAttempts: 1 });
    assert(!nameOnlyMediaReport.dimensions.negative_news.findings.some((finding) => finding.status === 'signal_found') && nameOnlyMediaReport.dimensions.negative_news.coverageGaps.some((gap) => gap.includes('no exact supplied CIN')), 'Name-only adverse-media claims remain unverified until fetched content confirms a supplied identifier');

    let receivedIdentifiers: string[] = [];
    tinyfish.searchDebarment = async (_name, options) => {
      receivedIdentifiers = options?.identifiers || [];
      return {
        success: true,
        status: 'LIVE',
        query: '"TATA STEEL LIMITED" "L27100MH1907PLC000260" debarment blacklisting suspension',
        articles: [{
          title: 'Official debarment order',
          url: 'https://gem.gov.in/orders/123',
          sourceDomain: 'gem.gov.in',
          snippet: 'TATA STEEL LIMITED CIN L27100MH1907PLC000260 was suspended from procurement.',
          retrievedAt: new Date().toISOString(),
          query: 'exact vendor and CIN search',
        }],
        isMock: false,
      };
    };
    const sourceMatchReport = await discoveryService.runDiscovery(vendor, { overallTimeoutMs: 1000, dimensionTimeoutMs: 500, maxAttempts: 1 });
    const sourceMatchTask = sourceMatchReport.dimensions.blacklist_debarment;
    assert(receivedIdentifiers.includes(vendor.cin), 'Debarment search query receives vendor identifiers');
    assert(sourceMatchTask.evidenceSearchOutcome === 'MATCH_FOUND', 'Fetched source with exact identifier and debarment term reports MATCH_FOUND');
    assert(sourceMatchTask.findings.some((finding) => finding.evidence.some((evidence) => evidence.url === 'https://gem.gov.in/orders/123' && Boolean(evidence.searchQuery) && evidence.identityMatchNote.includes(vendor.cin))), 'Matched evidence retains URL, query, retrieval time, excerpt, and exact identifier rationale');

    tinyfish.searchDebarment = async () => ({ ...emptySearchResult, query: 'exact vendor debarment query' });
    const noMatchReport = await discoveryService.runDiscovery(vendor, { overallTimeoutMs: 1000, dimensionTimeoutMs: 500, maxAttempts: 1 });
    const noMatchTask = noMatchReport.dimensions.blacklist_debarment;
    assert(noMatchTask.evidenceSearchOutcome === 'NO_MATCH_FOUND_IN_SEARCHED_SOURCES', 'Empty successful search is explicitly scoped as no match in searched sources');
    assert(noMatchTask.findings.every((finding) => finding.status !== 'no_signal_found_in_checked_sources'), 'No-result search never becomes a clean-standing finding');

    tinyfish.searchDebarment = async () => ({
      success: true,
      status: 'LIVE',
      query: 'official vendor debarment query',
      articles: [{ title: `Suspension order for ${vendor.cin}`, url: 'https://gem.gov.in/orders/blocked', sourceDomain: 'gem.gov.in', snippet: '', query: 'official query', directSourceAvailable: false, sourceFetchError: 'bot_blocked', identityMatchNote: 'Source fetch failed; no page content was retrieved, so target identity and a substantive procurement finding could not be verified.' }],
      sourceErrors: [{ url: 'https://gem.gov.in/orders/blocked', error: 'bot_blocked' }],
      isMock: false,
    });
    const inaccessibleReport = await discoveryService.runDiscovery(vendor, { overallTimeoutMs: 1000, dimensionTimeoutMs: 500, maxAttempts: 1 });
    const inaccessibleTask = inaccessibleReport.dimensions.blacklist_debarment;
    assert(inaccessibleTask.evidenceSearchOutcome === 'SOURCE_UNAVAILABLE' && inaccessibleTask.manualReviewRequired === true, 'Inaccessible fetched source requires manual review');
    assert(!inaccessibleTask.findings.some((finding) => finding.status === 'signal_found'), 'An inaccessible search result containing the vendor ID and a risk title cannot be promoted to a verified finding');
    assert(inaccessibleTask.findings.some((finding) => finding.evidence.some((evidence) => evidence.searchResultUrl === 'https://gem.gov.in/orders/blocked' && evidence.url === null && evidence.sourceFetchError?.includes('bot_blocked') && !evidence.snippet)), 'Unfetched search result is separated from direct evidence and retains its fetch failure without a fabricated excerpt');

    tinyfish.searchDebarment = async () => ({
      success: true,
      status: 'LIVE',
      query: 'vendor name and identifier debarment query',
      articles: [{ title: 'Suspension order', url: 'https://cvc.gov.in/orders/ambiguous', sourceDomain: 'cvc.gov.in', snippet: 'TATA STEEL LIMITED appears in a suspension notice but no CIN, GSTIN, or PAN is shown.', query: 'official query', retrievedAt: new Date().toISOString() }],
      isMock: false,
    });
    const ambiguousReport = await discoveryService.runDiscovery(vendor, { overallTimeoutMs: 1000, dimensionTimeoutMs: 500, maxAttempts: 1 });
    const ambiguousTask = ambiguousReport.dimensions.blacklist_debarment;
    assert(ambiguousTask.evidenceSearchOutcome === 'SOURCE_UNAVAILABLE' && ambiguousTask.manualReviewRequired === true, 'Name-only match with identifiers absent is classified as ambiguous for review');
    assert(ambiguousTask.findings.some((finding) => finding.status === 'source_unavailable' && finding.evidence.some((evidence) => evidence.identityMatchNote.includes('no supplied identifier'))), 'Ambiguous entity evidence includes the identity rationale');

    let retryCalls = 0;
    tinyfish.searchDebarment = async () => {
      retryCalls += 1;
      return {
        success: false,
        status: 'UPSTREAM_UNAVAILABLE',
        errorCategory: 'TIMEOUT',
        message: 'Simulated retryable timeout.',
        isMock: false,
      };
    };
    const retryReport = await discoveryService.runDiscovery(vendor, {
      overallTimeoutMs: 2000,
      dimensionTimeoutMs: 500,
      maxAttempts: 2,
      retryBackoffMs: 0,
    });
    assert(retryCalls === 2, `Retry budget permits exactly two total attempts (observed ${retryCalls})`);
    assert(retryReport.dimensions.blacklist_debarment.attemptCount === 2, 'Dimension result reports both bounded attempts');
    assert(retryReport.dimensions.blacklist_debarment.status === 'failed', 'Provider timeout after bounded retries remains failed');

    tinyfish.searchDebarment = async () => ({
      success: false,
      status: 'AUTH_FAILED',
      errorCategory: 'AUTH',
      message: 'Simulated authentication failure.',
      isMock: false,
    });
    const authFailureReport = await discoveryService.runDiscovery(vendor, {
      overallTimeoutMs: 1000,
      dimensionTimeoutMs: 500,
      maxAttempts: 2,
    });
    assert(authFailureReport.dimensions.blacklist_debarment.attemptCount === 1, 'Authentication failures are never retried');
    assert(authFailureReport.dimensions.blacklist_debarment.findings.length === 0, 'Authentication failure cannot create a verified finding');

    let agentAbortObserved = false;
    tinyfish.searchDebarment = async (_entityName, options) => new Promise((_, reject) => {
      options?.signal?.addEventListener('abort', () => {
        agentAbortObserved = true;
        reject(new Error('agent request aborted'));
      }, { once: true });
    });
    const perAgentTimeoutReport = await discoveryService.runDiscovery(vendor, {
      overallTimeoutMs: 1000,
      dimensionTimeoutMs: 20,
      maxAttempts: 1,
    });
    assert(agentAbortObserved, 'Per-agent deadline aborts the active provider request');
    assert(perAgentTimeoutReport.dimensions.blacklist_debarment.errorCategory === 'TIMEOUT', 'Per-agent deadline is classified as timeout');
    assert(perAgentTimeoutReport.dimensions.blacklist_debarment.attemptCount === 1, 'Per-agent timeout does not exceed the configured attempt count');

    agentAbortObserved = false;
    const overallTimeoutReport = await discoveryService.runDiscovery(vendor, {
      overallTimeoutMs: 20,
      dimensionTimeoutMs: 500,
      maxAttempts: 2,
    });
    assert(overallTimeoutReport.terminationReason === 'TIMEOUT', 'Overall deadline is reported distinctly from manual cancellation');
    assert(overallTimeoutReport.dimensions.blacklist_debarment.errorCategory === 'TIMEOUT', 'Overall deadline marks active agent work as timed out');
    assert(agentAbortObserved, 'Overall deadline aborts active provider requests');

    agentAbortObserved = false;
    const cancellationController = new AbortController();
    const cancellationPromise = discoveryService.runDiscovery(vendor, {
      overallTimeoutMs: 1000,
      dimensionTimeoutMs: 500,
      maxAttempts: 2,
      signal: cancellationController.signal,
    });
    setTimeout(() => cancellationController.abort(), 20);
    const cancelledReport = await cancellationPromise;
    assert(cancelledReport.status === 'cancelled', 'Manual cancellation produces a cancelled report status');
    assert(cancelledReport.terminationReason === 'CANCELLED', 'Manual cancellation is distinguished from timeout');
    assert(agentAbortObserved, 'Manual cancellation propagates to active provider requests');
    assert(Object.values(cancelledReport.dimensions).every((task) => task.status !== 'running'), 'Cancelled report contains no work still marked active');

    let lateCompletionReported = false;
    tinyfish.searchDebarment = async () => new Promise((resolve) => {
      setTimeout(() => {
        lateCompletionReported = true;
        resolve(emptySearchResult);
      }, 60);
    });
    const lateResultReport = await discoveryService.runDiscovery(vendor, {
      overallTimeoutMs: 1000,
      dimensionTimeoutMs: 20,
      maxAttempts: 1,
    });
    const lateTaskState = lateResultReport.dimensions.blacklist_debarment.status;
    await new Promise((resolve) => setTimeout(resolve, 70));
    assert(lateCompletionReported, 'Late provider completion was exercised after the task deadline');
    assert(lateResultReport.dimensions.blacklist_debarment.status === lateTaskState && lateTaskState === 'failed', 'Late completion cannot overwrite the timed-out task result');
    assert(lateResultReport.dimensions.blacklist_debarment.findings.length === 0, 'Late provider completion cannot add findings after timeout');
  } finally {
    tinyfish.searchDebarment = originalDebarmentSearch;
    tinyfish.searchAdverseMedia = originalMediaSearch;
    tinyfish.searchLitigationContext = originalLitigationSearch;
    indiacos.lookupByCIN = originalCINLookup;
    indiacos.lookupByGSTIN = originalGSTLookup;
    indiacos.lookupCases = originalCasesLookup;
    if (originalApiKey === undefined) delete process.env.TINYFISH_API_KEY;
    else process.env.TINYFISH_API_KEY = originalApiKey;
    if (originalIndiaCosApiKey === undefined) delete process.env.INDIACOS_API_KEY;
    else process.env.INDIACOS_API_KEY = originalIndiaCosApiKey;
  }

  return {
    success: assertionsFailed === 0,
    assertionsPassed,
    assertionsFailed,
    logs,
  };
}
