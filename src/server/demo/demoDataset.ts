/**
 * VendorTrace Fictional Demo Datasets & Guided Scenario
 * Guaranteed 100% synthetic, deterministic, and locally available.
 * Fictional names, identifiers, and dockets cannot be mistaken for real corporate entities.
 */

import { Finding, Investigation } from '../../types/vendor.js';
import { DimensionTaskResult, RiskFinding, RiskDimension } from '../../types/riskFinding.js';
import { EntityGraph } from '../../types/entityTracing.js';
import { VendorTraceAssessmentReport } from '../../types/crossValidation.js';

export const DEMO_NOTICE_BANNER =
  'DEMO DATA — SYNTHETIC EXAMPLE: Entirely fictional corporate entity and evidence for demonstration purposes. Not real findings or allegations.';

export const FICTIONAL_VENDOR_NAME = 'Acme Horizon Technologies Pvt Ltd (SYNTHETIC DEMO)';
export const FICTIONAL_CIN = 'U99999XX2024PTC999999';
export const FICTIONAL_GSTIN = '99AAAAA9999A1Z5';
export const FICTIONAL_PAN = 'AAAAA9999A';
export const FICTIONAL_DIRECTOR_DIN = '99999999';
export const FICTIONAL_DIRECTOR_NAME = 'Aarav Patel (Fictional Director)';

const now = new Date().toISOString();
const twoWeeksAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString();

// Layer 1 Findings for Initial Demo Run
export const DEMO_FINDINGS_RUN_1: RiskFinding[] = [
  {
    id: 'rf_demo_reg_01',
    dimension: 'company_registry',
    title: 'Active RoC Registration & Filing Compliance',
    neutralSummary: 'Entity active and in good standing with RoC Mumbai; authorized capital INR 1,00,00,000.',
    status: 'signal_found',
    severity: 1,
    severityExplanation: 'Active legal standing with regular statutory annual filings.',
    evidence: [
      {
        id: 'evi_demo_roc_1',
        sourceName: 'MCA21 Registry Fixture (Synthetic)',
        sourceDomain: 'mca-fixture.vendortrace.invalid',
        url: 'https://mca-fixture.vendortrace.invalid/company/U99999XX2024PTC999999',
        snippet: 'Company Status: ACTIVE. Class: Private. Paid up Capital: INR 50,00,000.',
        publishedAt: twoWeeksAgo,
        capturedAt: twoWeeksAgo,
        underlyingSource: 'Synthetic MCA21 registry fixture',
        identityMatchNote: 'Exact CIN Match',
        legalStatus: null,
      },
      {
        id: 'evi_demo_roc_fixture_2',
        sourceName: 'Independent Registry Fixture (Synthetic)',
        sourceDomain: 'registry-fixture.vendortrace.invalid',
        url: null,
        snippet: 'Synthetic corroboration fixture: ACTIVE status is included only to demonstrate two-source validation; this is not a live registry record.',
        publishedAt: twoWeeksAgo,
        capturedAt: twoWeeksAgo,
        underlyingSource: 'VendorTrace Synthetic Registry Fixture',
        identityMatchNote: 'Exact synthetic CIN fixture match',
        legalStatus: null,
      },
    ],
    confidence: 'multiple_independent_sources',
    recommendedReviewAction: 'In a live investigation, independently verify the registry status before vendor onboarding.',
    createdAt: twoWeeksAgo,
  },
  {
    id: 'rf_demo_gst_02',
    dimension: 'gst_compliance',
    title: 'Active GSTIN with Regular GSTR-3B Return Submissions',
    neutralSummary: 'Registered in Maharashtra; monthly return compliance score 98% with zero cancellations.',
    status: 'signal_found',
    severity: 1,
    severityExplanation: 'Clean GST compliance trajectory without active show-cause notices.',
    evidence: [
      {
        id: 'evi_demo_gst_1',
        sourceName: 'GSTN Taxpayer Fixture (Synthetic)',
        sourceDomain: 'gstn-fixture.vendortrace.invalid',
        url: 'https://gstn-fixture.vendortrace.invalid/taxpayer/99AAAAA9999A1Z5',
        snippet: 'Taxpayer Status: Active. Constitution of Business: Private Limited Company.',
        publishedAt: twoWeeksAgo,
        capturedAt: twoWeeksAgo,
        underlyingSource: 'GSTN System Return Ledger',
        identityMatchNote: 'Exact GSTIN Match',
        legalStatus: null,
      },
      {
        id: 'evi_demo_gst_fixture_2',
        sourceName: 'Independent Tax Filing Fixture (Synthetic)',
        sourceDomain: 'tax-fixture.vendortrace.invalid',
        url: null,
        snippet: 'Synthetic corroboration fixture: active GST status is included only to demonstrate two-source validation; this is not a live tax record.',
        publishedAt: twoWeeksAgo,
        capturedAt: twoWeeksAgo,
        underlyingSource: 'VendorTrace Synthetic Tax Fixture',
        identityMatchNote: 'Exact synthetic GSTIN fixture match',
        legalStatus: null,
      },
    ],
    confidence: 'multiple_independent_sources',
    recommendedReviewAction: 'In a live investigation, verify return filings and reconcile GST records before onboarding.',
    createdAt: twoWeeksAgo,
  },
  {
    id: 'rf_demo_crt_03',
    dimension: 'court_litigation',
    title: 'Commercial Recovery Summary Suit (CNR: MHCC01-999999-2025)',
    neutralSummary: 'Commercial summary recovery suit pending before High Court; conflicting assertions on docket.',
    status: 'conflicting_evidence',
    severity: 3,
    severityExplanation: 'Pending commercial dispute with contested claims filed by parties.',
    evidence: [
      {
        id: 'evi_demo_crt_claim',
        sourceName: 'Commercial Court Docket Fixture (Synthetic)',
        sourceDomain: 'court-fixture.vendortrace.invalid',
        url: 'https://court-fixture.vendortrace.invalid/cases/COMM_CS_9999_2025',
        snippet: 'Plaintiff claims outstanding vendor dues of INR 42,00,000 under Master Services Agreement.',
        publishedAt: twoWeeksAgo,
        capturedAt: twoWeeksAgo,
        underlyingSource: 'High Court Commercial Docket',
        identityMatchNote: 'Exact Company Name & Registered Address',
        legalStatus: 'pending',
      },
      {
        id: 'evi_demo_crt_defense',
        sourceName: 'Commercial Court Docket Fixture (Synthetic)',
        sourceDomain: 'court-fixture.vendortrace.invalid',
        url: 'https://court-fixture.vendortrace.invalid/cases/COMM_CS_9999_2025/defense',
        snippet: 'Vendor filed written statement asserting goods delivered were non-conforming; advance refund claimed.',
        publishedAt: twoWeeksAgo,
        capturedAt: twoWeeksAgo,
        underlyingSource: 'High Court Commercial Docket',
        identityMatchNote: 'Exact Company Name',
        legalStatus: 'pending',
      },
    ],
    confidence: 'conflicting_sources',
    recommendedReviewAction: 'Review commercial dispute indemnity affidavit and escrow protection.',
    createdAt: twoWeeksAgo,
  },
  {
    id: 'rf_demo_blk_04',
    dimension: 'blacklist_debarment',
    title: 'Provisional Contractor Grievance Notice (Single-Source)',
    neutralSummary: 'Informal payment dispute noted on contractor discussion forum; no official debarment order exists.',
    status: 'signal_found',
    severity: 2,
    severityExplanation: 'Uncorroborated single-source post; vendor is NOT debarred on GeM or CPPP official registries.',
    evidence: [
      {
        id: 'evi_demo_forum_1',
        sourceName: 'Contractor Complaint Fixture (Synthetic)',
        sourceDomain: 'complaint-fixture.vendortrace.invalid',
        url: 'https://complaint-fixture.vendortrace.invalid/posts/acme-horizon-notice',
        snippet: 'Subcontractor alleges delay in milestone release on regional pilot installation.',
        publishedAt: twoWeeksAgo,
        capturedAt: twoWeeksAgo,
        underlyingSource: 'Third-party discussion forum (Unverified)',
        identityMatchNote: 'Fuzzy Trade Name match only',
        legalStatus: 'alleged',
      },
    ],
    confidence: 'single_source_review',
    recommendedReviewAction: 'Compliance officer check: confirm zero listings on official GeM debarment portal.',
    createdAt: twoWeeksAgo,
  },
];

const createDemoDimensionResult = (
  dimension: RiskDimension,
  provider: string,
  sourcesChecked: string[],
  durationMs: number
): DimensionTaskResult => {
  const findings = DEMO_FINDINGS_RUN_1.filter((finding) => finding.dimension === dimension);

  return {
    dimension,
    title: dimension,
    status: 'completed',
    provider,
    startedAt: twoWeeksAgo,
    completedAt: twoWeeksAgo,
    durationMs,
    sourceCount: sourcesChecked.length,
    errorCategory: null,
    errorMessage: null,
    findings,
    findingsCount: findings.length,
    sourcesChecked,
    coverageGaps: [],
  };
};

const mapDemoRiskFindingToDisplayFinding = (item: RiskFinding): Finding => {
  const category: Finding['category'] = item.dimension === 'company_registry'
    ? 'REGISTRY'
    : item.dimension === 'gst_compliance'
    ? 'TAX'
    : item.dimension === 'court_litigation'
    ? 'LEGAL'
    : item.dimension === 'blacklist_debarment'
    ? 'DEBARMENT'
    : 'MEDIA';
  const sourceDomains = new Set(item.evidence.map((e) => String(e.sourceDomain || '').trim().toLowerCase()).filter(Boolean));
  const verificationStatus: Finding['verificationStatus'] = item.status === 'conflicting_evidence' || item.confidence === 'conflicting_sources'
    ? 'CONFLICTING_EVIDENCE'
    : item.confidence === 'multiple_independent_sources' && sourceDomains.size >= 2
    ? 'CORROBORATED'
    : item.status === 'source_unavailable'
    ? 'UNRESOLVED'
    : 'REQUIRES_HUMAN_REVIEW';
  const riskLevel: Finding['riskLevel'] = item.severity >= 4
    ? 'MATERIAL_RISK'
    : item.severity >= 2 || verificationStatus === 'CONFLICTING_EVIDENCE'
    ? 'CAUTION'
    : verificationStatus === 'CORROBORATED' && item.status === 'signal_found'
    ? 'VERIFIED_CLEAR'
    : 'UNKNOWN';
  const matchStrength: Finding['identityMatchStrength'] = item.evidence.some((e) => /fuzzy/i.test(e.identityMatchNote || ''))
    ? 'WEAK'
    : item.evidence.some((e) => /exact/i.test(e.identityMatchNote || ''))
    ? 'EXACT'
    : item.evidence.some((e) => /address/i.test(e.identityMatchNote || ''))
    ? 'HIGH'
    : 'PROBABLE';

  return {
    id: item.id,
    category,
    title: item.title,
    claim: item.neutralSummary,
    riskLevel,
    verificationStatus,
    isAllegation: item.evidence.some((e) => e.legalStatus === 'alleged') ||
      (item.dimension === 'court_litigation' && item.evidence.some((e) => e.legalStatus === 'pending')),
    sources: item.evidence.map((e) => ({
      sourceName: e.sourceName,
      sourceDomain: e.sourceDomain,
      url: e.url || null,
      snippet: e.snippet,
      retrievedAt: e.capturedAt || e.publishedAt || item.createdAt,
      provenance: e.underlyingSource,
      matchConfidence: /fuzzy/i.test(e.identityMatchNote || '')
        ? 'FUZZY_NAME_ONLY'
        : /address/i.test(e.identityMatchNote || '')
        ? 'NAME_AND_ADDRESS'
        : 'EXACT_IDENTIFIER',
    })),
    identityMatchStrength: matchStrength,
    notesForOfficer: item.recommendedReviewAction,
  };
};

const countDemoFindings = (findings: Finding[]) => ({
  verifiedClear: findings.filter((finding) => finding.riskLevel === 'VERIFIED_CLEAR').length,
  caution: findings.filter((finding) => finding.riskLevel === 'CAUTION').length,
  materialRisk: findings.filter((finding) => finding.riskLevel === 'MATERIAL_RISK').length,
  requiresReview: findings.filter((finding) => finding.verificationStatus !== 'CORROBORATED').length,
});

const DEMO_RECHECK_FINDING: RiskFinding = {
  id: 'rf_demo_arb_05',
  dimension: 'court_litigation',
  title: 'Consent Award Recorded in Separate Commercial Arbitration (Synthetic Example)',
  neutralSummary: 'A separate synthetic arbitration record is shown as disposed pursuant to consent terms. It is a distinct matter and does not resolve the pending High Court recovery suit.',
  status: 'signal_found',
  severity: 2,
  severityExplanation: 'A separate procedural matter is illustrated as disposed; its linkage and disposition must be independently checked in live mode.',
  evidence: [
    {
      id: 'evi_demo_arb_consent',
      sourceName: 'Arbitration Tribunal Fixture (Synthetic)',
      sourceDomain: 'arbitration-fixture.vendortrace.invalid',
      url: 'https://arbitration-fixture.vendortrace.invalid/awards/ARB_999_2026',
      snippet: 'Synthetic demo record: consent terms recorded and matter disposed. This is not a real case or legal finding.',
      publishedAt: now,
      capturedAt: now,
      underlyingSource: 'Synthetic Tribunal Disposal Fixture',
      identityMatchNote: 'Exact synthetic Corporate CIN fixture',
      legalStatus: 'settled',
    },
    {
      id: 'evi_demo_arb_consent_fixture_2',
      sourceName: 'Independent Disposal Index Fixture (Synthetic)',
      sourceDomain: 'disposal-fixture.vendortrace.invalid',
      url: null,
      snippet: 'Synthetic second-source fixture for demonstrating independent corroboration of a disposed procedural matter. Not a live court or tribunal record.',
      publishedAt: now,
      capturedAt: now,
      underlyingSource: 'VendorTrace Synthetic Disposal Index',
      identityMatchNote: 'Exact synthetic Corporate CIN fixture',
      legalStatus: 'settled',
    },
  ],
  confidence: 'multiple_independent_sources',
  recommendedReviewAction: 'Confirm the case identity and obtain the official signed disposal order before relying on the result.',
  createdAt: now,
};

// Layer 2 Related-Entity Graph
export const DEMO_ENTITY_GRAPH: EntityGraph = {
  nodes: [
    {
      id: 'demo_root',
      name: FICTIONAL_VENDOR_NAME,
      nodeType: 'PRIMARY_VENDOR',
      cin: FICTIONAL_CIN,
      matchConfidence: 'EXACT',
      provenance: 'Investigation Target (Fictional)',
      lightweightReviewStatus: 'CAUTION',
    },
    {
      id: 'demo_dir',
      name: FICTIONAL_DIRECTOR_NAME,
      nodeType: 'DIRECTOR',
      din: FICTIONAL_DIRECTOR_DIN,
      matchConfidence: 'EXACT_DIN',
      provenance: 'Synthetic director fixture',
      lightweightReviewStatus: 'UNKNOWN',
    },
    {
      id: 'demo_rel_company',
      name: 'Nova Horizon Logistics LLP (SYNTHETIC)',
      nodeType: 'RELATED_COMPANY',
      cin: 'AAA-9999',
      matchConfidence: 'EXACT_DIN',
      provenance: 'Synthetic MCA21 LLP fixture',
      lightweightReviewStatus: 'UNKNOWN',
      lightweightReviewNote: 'Synthetic relationship fixture only. No separate Layer 1 risk scan is included, so no clean-risk conclusion is made.',
    },
    {
      id: 'demo_address',
      name: 'Unit 401, Tech Horizon Cyber City, BKC Mumbai 400051 (Fictional)',
      nodeType: 'REGISTERED_ADDRESS',
      matchConfidence: 'EXACT_ROC_ADDRESS',
      provenance: 'Synthetic registered-office fixture',
      lightweightReviewStatus: 'UNKNOWN',
    },
    {
      id: 'demo_colocated_company',
      name: 'Zenith Digital Solutions Pvt Ltd (SYNTHETIC)',
      nodeType: 'RELATED_COMPANY',
      cin: 'U72900MH2023PTC888888',
      matchConfidence: 'SAME_ADDRESS_CANDIDATE',
      provenance: 'Co-located RoC Address Index',
      lightweightReviewStatus: 'UNKNOWN',
      lightweightReviewNote: 'Shared commercial office complex. Candidate lead only, not proof of joint control.',
    },
  ],
  edges: [
    {
      id: 'demo_edge_1',
      source: 'demo_root',
      target: 'demo_dir',
      relationshipType: 'SHARED_DIRECTOR',
      strength: 'strong_identifier',
      label: 'Director (DIN 99999999)',
      evidenceIds: ['evi_demo_dir_1'],
      sourceUrls: ['https://mca-fixture.vendortrace.invalid/din/99999999'],
      provenance: 'Synthetic MCA21 registry fixture',
      disclaimer: 'Documented public registry directorship link.',
    },
    {
      id: 'demo_edge_2',
      source: 'demo_dir',
      target: 'demo_rel_company',
      relationshipType: 'SHARED_DIRECTOR',
      strength: 'strong_identifier',
      label: 'Designated Partner (DIN 99999999)',
      evidenceIds: ['evi_demo_dir_2'],
      sourceUrls: ['https://mca-fixture.vendortrace.invalid/llp/AAA-9999'],
      provenance: 'Synthetic MCA21 registry fixture',
      disclaimer: 'Directorship association lead.',
    },
    {
      id: 'demo_edge_3',
      source: 'demo_root',
      target: 'demo_address',
      relationshipType: 'SHARED_ADDRESS',
      strength: 'registry_link',
      label: 'Registered Office',
      evidenceIds: ['evi_demo_addr_1'],
      sourceUrls: ['https://mca-fixture.vendortrace.invalid/company/U99999XX2024PTC999999'],
      provenance: 'Synthetic RoC filing fixture',
      disclaimer: 'Official registered address.',
    },
    {
      id: 'demo_edge_4',
      source: 'demo_address',
      target: 'demo_colocated_company',
      relationshipType: 'SHARED_ADDRESS',
      strength: 'same_address_candidate',
      label: 'Candidate: Co-located Office',
      evidenceIds: ['evi_demo_addr_2'],
      sourceUrls: ['https://mca-fixture.vendortrace.invalid/company/U72900MH2023PTC888888'],
      provenance: 'Synthetic commercial address index',
      disclaimer: 'Candidate match only; shared business center does not indicate common liability.',
    },
  ],
  anchorsUsed: [
    {
      id: 'anc_demo_cin',
      type: 'CIN',
      value: FICTIONAL_CIN,
      label: `Corporate Identification Number: ${FICTIONAL_CIN}`,
      provenance: 'Synthetic MCA21 registry fixture',
    },
    {
      id: 'anc_demo_din',
      type: 'DIN',
      value: FICTIONAL_DIRECTOR_DIN,
      label: `Director DIN: ${FICTIONAL_DIRECTOR_DIN} (${FICTIONAL_DIRECTOR_NAME})`,
      provenance: 'Synthetic director fixture',
    },
  ],
  disclaimer: 'Discovery leads for manual audit: Shared directors or addresses do not prove common liability or wrongdoing.',
  stats: {
    totalRelatedEntities: 2,
    totalDirectors: 1,
    strongIdentifierMatches: 2,
    candidateMatches: 1,
    depth: 1,
    maxCandidatesLimit: 10,
  },
};

// Initial Demo Investigation Object
export const DEMO_INVESTIGATION_RUN_1: Investigation = {
  id: 'inv_demo_run_01',
  targetName: FICTIONAL_VENDOR_NAME,
  identifierType: 'CIN',
  identifierValue: FICTIONAL_CIN,
  status: 'COMPLETED',
  createdAt: twoWeeksAgo,
  completedAt: twoWeeksAgo,
  requestedBy: 'Senior Compliance Auditor (Demo Session)',
  sourcesChecked: [
    'MCA21 registry fixture (synthetic)',
    'Independent registry corroboration fixture (synthetic)',
    'GSTN taxpayer fixture (synthetic)',
    'Independent tax filing fixture (synthetic)',
    'Contested commercial docket fixture (synthetic)',
    'Contractor complaint / debarment fixture (synthetic)',
  ],
  findingsCount: countDemoFindings(DEMO_FINDINGS_RUN_1.map(mapDemoRiskFindingToDisplayFinding)),
  findings: DEMO_FINDINGS_RUN_1.map(mapDemoRiskFindingToDisplayFinding),
  normalizedFindings: DEMO_FINDINGS_RUN_1,
  dimensionResults: {
    company_registry: createDemoDimensionResult(
      'company_registry',
      'IndiaCos MCA21 Gateway',
      ['Synthetic MCA21 registry fixture', 'Independent registry corroboration fixture (synthetic)'],
      410
    ),
    gst_compliance: createDemoDimensionResult(
      'gst_compliance',
      'IndiaCos GSTN Gateway',
      ['Synthetic GSTN taxpayer fixture', 'Independent tax filing fixture (synthetic)'],
      380
    ),
    court_litigation: createDemoDimensionResult(
      'court_litigation',
      'IndiaCos Case API / TinyFish Legal',
      ['Contested commercial docket fixture (synthetic)'],
      520
    ),
    blacklist_debarment: createDemoDimensionResult(
      'blacklist_debarment',
      'TinyFish Web Agent',
      ['Synthetic GeM-like debarment fixture (not a live portal)'],
      440
    ),
  },
  coverageGaps: [],
  totalDurationMs: 1750,
  relatedLeads: [
    {
      id: 'rel_demo_1',
      legalName: 'Nova Horizon Logistics LLP (SYNTHETIC)',
      cin: 'AAA-9999',
      relationType: 'SHARED_DIRECTOR',
      sharedDirectorName: FICTIONAL_DIRECTOR_NAME,
      sharedDin: FICTIONAL_DIRECTOR_DIN,
      companyStatus: 'UNKNOWN',
      leadDisclaimer: 'Synthetic discovery lead for manual review; no separate risk scan is included, and shared directorship does not imply misconduct.',
    },
    {
      id: 'rel_demo_2',
      legalName: 'Zenith Digital Solutions Pvt Ltd (SYNTHETIC)',
      cin: 'U72900MH2023PTC888888',
      relationType: 'REGISTERED_ADDRESS',
      sharedAddress: 'Unit 401, Tech Horizon Cyber City, BKC Mumbai 400051',
      companyStatus: 'UNKNOWN',
      leadDisclaimer: 'Synthetic candidate lead only; no separate risk scan is included, and co-location does not indicate common liability.',
    },
  ],
  entityGraph: DEMO_ENTITY_GRAPH,
  assessmentReport: {
    investigationId: 'inv_demo_run_01',
    vendorId: 'ven_demo_01',
    vendorName: FICTIONAL_VENDOR_NAME,
    explainableRiskScore: 48,
    overallReviewPriority: 'REVIEW_RECOMMENDED',
    coverageStatus: 'PARTIAL',
    coverageGaps: ['Negative news / adverse regulatory media was not included in this synthetic walkthrough.'],
    factorScores: {
      severityScore: 20,
      confidenceScore: 12,
      recencyScore: 8,
      identityMatchScore: 8,
    },
    primaryRuleApplied: 'RULE_CONFLICTING_SOURCES_PRESENT',
    dimensionCards: {} as any,
    briefSummary: {
      text: 'This synthetic scenario illustrates registry and GST status corroborated by two demo fixtures each. A separate pending recovery suit contains conflicting party assertions, while an unofficial single-source grievance remains for human review. Demo fixtures are not live evidence and must not support a real procurement decision.',
      citedEvidenceIds: ['evi_demo_crt_claim', 'evi_demo_crt_defense'],
      generatedBy: 'DETERMINISTIC_RULES',
    },
    unresolvedQueue: [
      {
        id: 'unres_1',
        title: 'Commercial Recovery Summary Suit (Contested)',
        dimension: 'court_litigation',
        reason: 'Conflicting assertions: Plaintiff claims outstanding invoice while vendor asserts counter-claim.',
        severity: 3,
        recommendedAction: 'Request status certificate or escrow agreement from vendor.',
      },
      {
        id: 'unres_2',
        title: 'Provisional Contractor Grievance Notice',
        dimension: 'blacklist_debarment',
        reason: 'Single-source unofficial claim: Requires confirmation that zero debarment exists on official GeM portal.',
        severity: 2,
        recommendedAction: 'Verify official GeM clearance report.',
      },
    ],
    isStale: false,
    evaluatedAt: twoWeeksAgo,
  },
  summaryNarrative:
    'Fictional synthetic due diligence walkthrough covering MCA21, GSTN, High Court dockets, and debarment checks.',
};

// Re-run Demo Investigation Object (Adds one distinct corroborated procedural update; it does not resolve the pending recovery suit).
export const DEMO_INVESTIGATION_RUN_2: Investigation = {
  ...DEMO_INVESTIGATION_RUN_1,
  id: 'inv_demo_run_02',
  createdAt: now,
  completedAt: now,
  findingsCount: countDemoFindings([
    ...DEMO_FINDINGS_RUN_1.map(mapDemoRiskFindingToDisplayFinding),
    mapDemoRiskFindingToDisplayFinding(DEMO_RECHECK_FINDING),
  ]),
  sourcesChecked: [
    ...DEMO_INVESTIGATION_RUN_1.sourcesChecked,
    'Arbitration tribunal fixture (synthetic)',
    'Independent disposal index fixture (synthetic)',
  ],
  findings: [
    ...DEMO_INVESTIGATION_RUN_1.findings,
    mapDemoRiskFindingToDisplayFinding(DEMO_RECHECK_FINDING),
  ],
  normalizedFindings: [...DEMO_FINDINGS_RUN_1, DEMO_RECHECK_FINDING],
  assessmentReport: {
    ...DEMO_INVESTIGATION_RUN_1.assessmentReport!,
    investigationId: 'inv_demo_run_02',
    evaluatedAt: now,
    briefSummary: {
      text: 'This synthetic re-check retains the pending contested recovery case and the single-source grievance for review. It also introduces a distinct disposed arbitration fixture corroborated by two synthetic sources. The new matter does not resolve the pending recovery suit; all demo fixtures are fictional.',
      citedEvidenceIds: ['evi_demo_crt_claim', 'evi_demo_crt_defense', 'evi_demo_arb_consent', 'evi_demo_arb_consent_fixture_2'],
      generatedBy: 'DETERMINISTIC_RULES',
    },
  },
};
