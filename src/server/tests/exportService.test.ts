/**
 * Export Service Test Suite
 * Tests Unicode company names, commas/newlines in snippets, large evidence lists,
 * missing source URLs, partial coverage limitations, PDF buffer integrity, and empty report prevention.
 */

import { exportService, EXPORT_LEGAL_DISCLAIMER } from '../services/exportService.js';
import { Investigation } from '../../types/vendor.js';
import { RiskFinding } from '../../types/riskFinding.js';

export async function runExportTests(): Promise<{
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

  logs.push('=== 1. TESTING UNICODE COMPANY NAMES & SPECIAL CHARACTERS ===');
  const unicodeName = 'टाटा स्टील लिमिटेड / Tata Steel Ltd™ (Société Générale Partner)';
  const unicodeFinding: RiskFinding = {
    id: 'rf_uni_01',
    dimension: 'court_litigation',
    title: 'Commercial Recovery Claim (रुपये ५ करोड़)',
    neutralSummary: 'Suit pending before commercial bench; राशि ₹5,00,00,000/-',
    status: 'signal_found',
    severity: 3,
    severityExplanation: 'Pending recovery claim with currency symbol.',
    evidence: [
      {
        id: 'evi_uni_1',
        sourceName: 'Bombay High Court (उच्च न्यायालय)',
        sourceDomain: 'bombayhighcourt.nic.in',
        url: 'https://bombayhighcourt.nic.in/case/101',
        snippet: 'समंस जारी किया गया — Summons issued in Mumbai bench.',
        publishedAt: now,
        capturedAt: now,
        underlyingSource: 'High Court Official Docket',
        identityMatchNote: 'Exact Hindi/English Name Match',
        legalStatus: 'pending',
      },
    ],
    confidence: 'single_source_review',
    recommendedReviewAction: 'Request status affidavit.',
    createdAt: now,
  };

  const unicodeInvestigation: Investigation = {
    id: 'inv_test_unicode_01',
    targetName: unicodeName,
    identifierType: 'CIN',
    identifierValue: 'L27100MH1907PLC000260',
    status: 'COMPLETED',
    createdAt: now,
    requestedBy: 'Compliance Officer',
    sourcesChecked: ['MCA21', 'Bombay High Court'],
    findingsCount: { verifiedClear: 0, caution: 1, materialRisk: 0, requiresReview: 1 },
    findings: [],
    relatedLeads: [],
    normalizedFindings: [unicodeFinding],
    assessmentReport: {
      investigationId: 'inv_test_unicode_01',
      vendorId: 'ven_uni_1',
      vendorName: unicodeName,
      explainableRiskScore: 65,
      overallReviewPriority: 'REVIEW_RECOMMENDED',
      coverageStatus: 'ADEQUATE',
      factorScores: { severityScore: 25, confidenceScore: 20, recencyScore: 10, identityMatchScore: 10 },
      primaryRuleApplied: 'RULE_SINGLE_SOURCE',
      dimensionCards: {} as any,
      briefSummary: { text: 'Unicode corporate identity validated.', citedEvidenceIds: ['evi_uni_1'], generatedBy: 'DETERMINISTIC_RULES' },
      unresolvedQueue: [],
      isStale: false,
      evaluatedAt: now,
    },
  };

  const unicodeCsv = exportService.generateCsvRegister(unicodeInvestigation);
  assert(unicodeCsv.includes(unicodeName), 'CSV contains full Unicode Indic corporate name without corruption');
  assert(unicodeCsv.includes('रुपये ५ करोड़'), 'CSV contains Devanagari numerals and script');

  const unicodePdfBytes = exportService.generatePdfReport(unicodeInvestigation);
  assert(unicodePdfBytes.length > 500, 'PDF generated for Unicode investigation is non-empty');
  const pdfHeader = String.fromCharCode(...unicodePdfBytes.slice(0, 5));
  assert(pdfHeader === '%PDF-', 'PDF file begins with standard %PDF- header magic bytes');

  const canonicalAssessmentReport = {
    ...unicodeInvestigation,
    assessmentReport: {
      ...unicodeInvestigation.assessmentReport!,
      scoreBreakdown: { totalScore: 64 } as any,
      reviewPriority: 'REVIEW_RECOMMENDED' as const,
      explainableRiskScore: undefined,
      overallReviewPriority: undefined,
    },
  } as Investigation;
  const canonicalCsv = exportService.generateCsvRegister(canonicalAssessmentReport);
  const canonicalPdf = new TextDecoder().decode(exportService.generatePdfReport(canonicalAssessmentReport));
  assert(canonicalCsv.includes('"64"') && canonicalCsv.includes('"Review Recommended"'), 'CSV uses canonical score and priority fields');
  assert(canonicalPdf.includes('64 / 100') && canonicalPdf.includes('Review Recommended') && !canonicalPdf.includes('undefined'), 'PDF uses the same canonical score and priority as the UI without undefined values');
  const uncalculatedReport = { ...unicodeInvestigation, assessmentReport: undefined } as Investigation;
  assert(exportService.generateCsvRegister(uncalculatedReport).includes('"Not Calculated"'), 'CSV labels an unavailable score and priority as Not Calculated');
  const uncalculatedPdf = new TextDecoder().decode(exportService.generatePdfReport(uncalculatedReport));
  assert(uncalculatedPdf.includes('Not Calculated') && !uncalculatedPdf.includes('undefined'), 'PDF labels uncalculated values and never prints undefined');
  const caseCandidate = {
    ...unicodeFinding,
    title: 'Unverified Court Case Candidate: CS/2024/42',
    status: 'inconclusive' as const,
    severity: 1 as const,
    evidence: [{ ...unicodeFinding.evidence[0], sourceTitle: 'Commercial Suit CS/2024/42', publisher: 'Delhi High Court', url: null, snippet: 'Case number CS/2024/42 | Court: Delhi High Court | Petitioner: Tata Steel Limited | Respondent: Example Vendor', caseId: 'case-42', caseNumber: 'CS/2024/42', caseCourt: 'Delhi High Court', casePetitioner: 'Tata Steel Limited', caseRespondent: 'Example Vendor', caseStatus: 'pending', caseDate: '2024-02-12', identityMatchNote: 'Unverified candidate requiring human review.' }],
  };
  const caseReport = { ...unicodeInvestigation, normalizedFindings: [caseCandidate] } as Investigation;
  const caseCsv = exportService.generateCsvRegister(caseReport);
  const casePdf = new TextDecoder().decode(exportService.generatePdfReport(caseReport));
  assert(caseCsv.includes('"case-42"') && caseCsv.includes('"CS/2024/42"') && caseCsv.includes('"Example Vendor"'), 'CSV preserves case IDs, numbers, parties, and other candidate metadata');
  assert(caseCsv.includes('"No direct source URL supplied."') && caseCsv.includes('"Delhi High Court"') && caseCsv.includes('"Commercial Suit CS/2024/42"') && caseCsv.includes('publisher') && caseCsv.includes('source_title'), 'CSV explicitly labels missing direct URLs and exports publisher and source title provenance');
  assert(casePdf.includes('UNVERIFIED COURT CASE CANDIDATES') && casePdf.includes('No direct source URL supplied.') && casePdf.includes('Page 1 of'), 'PDF labels missing case URLs and unverified court candidates');

  logs.push('=== 2. TESTING COMMAS, QUOTES, AND NEWLINES IN SNIPPETS (RFC 4180 COMPLIANCE) ===');
  const trickyFinding: RiskFinding = {
    id: 'rf_tricky_02',
    dimension: 'blacklist_debarment',
    title: 'Debarment Notice, Order #492/A',
    neutralSummary: 'Order details with "double quotes", commas, and\r\nnewlines inside text.',
    status: 'signal_found',
    severity: 4,
    severityExplanation: 'Active public procurement debarment.',
    evidence: [
      {
        id: 'evi_trick_1',
        sourceName: 'GeM Incident Portal, Ministry of Commerce',
        sourceDomain: 'gem.gov.in',
        url: 'https://gem.gov.in/debarment/492',
        snippet: 'Line 1: Debarred for 180 days.\nLine 2: Breach of clause 4.2 ("Delivery Terms").\nLine 3: Penalty INR 1,50,000.',
        publishedAt: now,
        capturedAt: now,
        underlyingSource: 'Debarment Ledger',
        identityMatchNote: 'Exact CIN',
        legalStatus: 'confirmed',
      },
    ],
    confidence: 'multiple_independent_sources',
    recommendedReviewAction: 'Escalate to procurement committee.',
    createdAt: now,
  };

  const trickyInvestigation: Investigation = {
    ...unicodeInvestigation,
    id: 'inv_test_tricky_02',
    normalizedFindings: [trickyFinding],
  };

  const trickyCsv = exportService.generateCsvRegister(trickyInvestigation);
  // In RFC 4180, quotes must be doubled: ""Delivery Terms""
  assert(trickyCsv.includes('""Delivery Terms""'), 'Quotes inside evidence snippets are doubled according to RFC 4180');
  // Snippets with newlines must be enclosed in quotes
  assert(trickyCsv.includes('"Line 1: Debarred for 180 days.\nLine 2: Breach of clause 4.2 (""Delivery Terms"").\nLine 3: Penalty INR 1,50,000."'), 'Multi-line snippet with commas and quotes wrapped properly in CSV');

  logs.push('=== 3. TESTING LARGE EVIDENCE LISTS (>100 ITEMS) ===');
  const largeFindings: RiskFinding[] = [];
  for (let i = 1; i <= 120; i++) {
    largeFindings.push({
      id: `rf_large_${i}`,
      dimension: i % 2 === 0 ? 'court_litigation' : 'gst_compliance',
      title: `Docket Entry #${i} - Recovery Suit`,
      neutralSummary: `Procedural court filing number ${i} regarding invoice dispute.`,
      status: 'signal_found',
      severity: 2,
      severityExplanation: 'Routine litigation entry.',
      evidence: [
        {
          id: `evi_large_${i}`,
          sourceName: `Court Jurisdiction ${i % 5}`,
          sourceDomain: 'ecourts.gov.in',
          url: `https://services.ecourts.gov.in/case/${i}`,
          snippet: `Record ${i}: Notice issued on commercial application.`,
          publishedAt: now,
          capturedAt: now,
          underlyingSource: 'E-Courts Docket',
          identityMatchNote: 'CIN match',
          legalStatus: 'pending',
        },
      ],
      confidence: 'single_source_review',
      recommendedReviewAction: 'Review during periodic audit.',
      createdAt: now,
    });
  }

  const largeInvestigation: Investigation = {
    ...unicodeInvestigation,
    id: 'inv_test_large_03',
    normalizedFindings: largeFindings,
  };

  const largeCsv = exportService.generateCsvRegister(largeInvestigation);
  const csvLines = largeCsv.split('\r\n');
  assert(csvLines.length >= 121, 'CSV Evidence Register outputs 120+ rows for dense evidence lists');

  const largePdfBytes = exportService.generatePdfReport(largeInvestigation);
  assert(largePdfBytes.length > 5000, 'PDF generator paginates and compiles dense evidence lists cleanly');

  logs.push('=== 4. TESTING MISSING SOURCE URLS & NULL FIELDS ===');
  const missingUrlFinding: RiskFinding = {
    id: 'rf_missing_url',
    dimension: 'company_registry',
    title: 'RoC Physical Notice',
    neutralSummary: 'Internal RoC notice issued via physical courier; no public web URL available.',
    status: 'signal_found',
    severity: 2,
    severityExplanation: 'Physical RoC inspection notice.',
    evidence: [
      {
        id: 'evi_missing_url',
        searchResultUrl: 'https://gem.gov.in/notices/slow-source.pdf',
        sourceFetchError: 'Request timed out after 30000ms.',
        sourceName: 'Registrar of Companies, Mumbai',
        sourceDomain: '',
        url: '', // Empty URL
        snippet: '',
        publishedAt: now,
        capturedAt: now,
        underlyingSource: 'Physical Filing',
        identityMatchNote: 'CIN Verified',
        legalStatus: 'pending',
      },
    ],
    confidence: 'single_source_review',
    recommendedReviewAction: 'Inspect physical RoC ledger.',
    createdAt: now,
  };

  const missingUrlInvestigation: Investigation = {
    ...unicodeInvestigation,
    id: 'inv_test_missing_04',
    normalizedFindings: [missingUrlFinding],
  };

  const missingUrlCsv = exportService.generateCsvRegister(missingUrlInvestigation);
  assert(missingUrlCsv.includes('"No direct source URL supplied."') && missingUrlCsv.includes('https://gem.gov.in/notices/slow-source.pdf') && missingUrlCsv.includes('Request timed out'), 'CSV distinguishes an unfetched search result from a direct source and records the fetch failure');
  const missingUrlPdf = exportService.generatePdfReport(missingUrlInvestigation);
  const missingUrlPdfText = new TextDecoder().decode(missingUrlPdf);
  assert(missingUrlPdf.length > 500 && missingUrlPdfText.includes('No direct source URL supplied.') && missingUrlPdfText.includes('source not fetched') && missingUrlPdfText.includes('Request timed out'), 'PDF explicitly distinguishes an unfetched result and discloses the retrieval failure');

  logs.push('=== 5. TESTING PARTIAL COVERAGE REPORT EXPORT ===');
  const partialInvestigation: Investigation = {
    ...unicodeInvestigation,
    id: 'inv_test_partial_05',
    coverageGaps: ['Court Litigation registry timed out (court_litigation)'],
    assessmentReport: {
      ...unicodeInvestigation.assessmentReport!,
      coverageStatus: 'INADEQUATE',
      reviewPriority: 'INSUFFICIENT_COVERAGE',
      overallReviewPriority: 'INSUFFICIENT_COVERAGE',
    },
  };

  const partialPdf = exportService.generatePdfReport(partialInvestigation);
  assert(partialPdf.length > 500, 'Partial coverage report exported successfully to PDF');

  logs.push('=== 6. TESTING PREVENTION OF EMPTY DATA EXPORT ===');
  let emptyExportCaught = false;
  try {
    exportService.generateCsvRegister({
      ...unicodeInvestigation,
      normalizedFindings: [],
      findings: [],
    });
  } catch (err: any) {
    emptyExportCaught = true;
    assert(err.message.includes('contains no findings'), 'Throws explicit error preventing silent export of empty data');
  }
  assert(emptyExportCaught, 'Empty export prevented safely');

  logs.push('=== 7. TESTING MANDATORY DEMO NOTICE ON SYNTHETIC EXPORTS ===');
  const demoInvestigation: Investigation = {
    ...unicodeInvestigation,
    id: 'inv_demo_run_01',
    targetName: 'Acme Horizon Technologies Pvt Ltd (SYNTHETIC DEMO)',
  };

  const demoCsv = exportService.generateCsvRegister(demoInvestigation);
  assert(
    demoCsv.includes('DEMO DATA — SYNTHETIC EXAMPLE'),
    'Demo CSV export strictly includes prominent DEMO DATA notice banner'
  );

  const demoPdf = exportService.generatePdfReport(demoInvestigation);
  const pdfString = Buffer.from(demoPdf).toString('latin1');
  assert(
    pdfString.includes('DEMO DATA') || pdfString.includes('SYNTHETIC'),
    'Demo PDF export strictly renders prominent synthetic demo banner'
  );

  return {
    success: assertionsFailed === 0,
    assertionsPassed,
    assertionsFailed,
    logs,
  };
}
