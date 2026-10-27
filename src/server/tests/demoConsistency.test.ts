/**
 * Demo-mode integrity checks. Synthetic entities, evidence domains and links must never
 * masquerade as real source records, and all displayed counts/confidence labels must
 * agree with the underlying fixtures.
 */
import {
  DEMO_ENTITY_GRAPH,
  DEMO_FINDINGS_RUN_1,
  DEMO_INVESTIGATION_RUN_1,
  DEMO_INVESTIGATION_RUN_2,
} from '../demo/demoDataset.js';

interface TestResult {
  assertionsPassed: number;
  assertionsFailed: number;
  logs: string[];
}

export async function runDemoConsistencyTests(): Promise<TestResult> {
  const logs: string[] = [];
  let assertionsPassed = 0;
  let assertionsFailed = 0;

  const assert = (condition: boolean, message: string) => {
    if (condition) {
      assertionsPassed += 1;
      logs.push(`[PASS] ${message}`);
    } else {
      assertionsFailed += 1;
      logs.push(`[FAIL] ${message}`);
    }
  };

  const checkCounts = (run: typeof DEMO_INVESTIGATION_RUN_1, label: string) => {
    assert(run.findingsCount.verifiedClear === run.findings.filter((f) => f.riskLevel === 'VERIFIED_CLEAR').length,
      `${label}: verified-clear count matches displayed findings`);
    assert(run.findingsCount.caution === run.findings.filter((f) => f.riskLevel === 'CAUTION').length,
      `${label}: caution count matches displayed findings`);
    assert(run.findingsCount.materialRisk === run.findings.filter((f) => f.riskLevel === 'MATERIAL_RISK').length,
      `${label}: material-risk count matches displayed findings`);
    assert(run.findingsCount.requiresReview === run.findings.filter((f) => f.verificationStatus !== 'CORROBORATED').length,
      `${label}: human-review count matches verification statuses`);
  };

  const checkSyntheticEvidence = (run: typeof DEMO_INVESTIGATION_RUN_1, label: string) => {
    const evidence = run.findings.flatMap((finding) => finding.sources);
    assert(evidence.every((item) => item.sourceDomain.toLowerCase().endsWith('.invalid')),
      `${label}: every evidence domain is a reserved .invalid fixture domain`);
    assert(evidence.every((item) => {
      if (!item.url) return true;
      try { return new URL(item.url).hostname.toLowerCase().endsWith('.invalid'); }
      catch { return false; }
    }), `${label}: every clickable evidence URL is a reserved .invalid fixture link`);
    assert(run.sourcesChecked.every((source) => /synthetic|fixture/i.test(source)),
      `${label}: source-check list clearly identifies synthetic fixtures`);
    assert(run.findings.every((finding) => finding.sources.length > 0),
      `${label}: every displayed finding includes evidence metadata`);
    assert(run.findings.filter((finding) => finding.verificationStatus === 'CORROBORATED').every((finding) => {
      const domains = new Set(finding.sources.map((source) => source.sourceDomain.toLowerCase()));
      return domains.size >= 2;
    }), `${label}: every CORROBORATED finding has at least two distinct source domains`);
  };

  assert(DEMO_INVESTIGATION_RUN_1.findings.length === DEMO_INVESTIGATION_RUN_1.normalizedFindings?.length,
    'Run 1: normalized and displayed finding counts match');
  assert(DEMO_INVESTIGATION_RUN_1.findings.length === 4, 'Run 1: expected four deterministic demo findings are present');
  checkCounts(DEMO_INVESTIGATION_RUN_1, 'Run 1');
  checkSyntheticEvidence(DEMO_INVESTIGATION_RUN_1, 'Run 1');

  const courtFinding = DEMO_INVESTIGATION_RUN_1.findings.find((finding) => finding.category === 'LEGAL');
  assert(courtFinding?.verificationStatus === 'CONFLICTING_EVIDENCE',
    'Run 1: contested legal matter is labeled conflicting evidence');
  assert(courtFinding?.riskLevel === 'CAUTION',
    'Run 1: contested legal matter is not treated as verified clear');
  const singleSourceFinding = DEMO_INVESTIGATION_RUN_1.findings.find((finding) => finding.category === 'DEBARMENT');
  assert(singleSourceFinding?.verificationStatus === 'REQUIRES_HUMAN_REVIEW',
    'Run 1: single-source debarment-related complaint requires human review');

  assert(DEMO_INVESTIGATION_RUN_2.findings.length === DEMO_INVESTIGATION_RUN_2.normalizedFindings?.length,
    'Run 2: normalized and displayed finding counts match');
  assert(DEMO_INVESTIGATION_RUN_2.findings.length === 5, 'Run 2: exactly one distinct finding is added');
  assert(DEMO_INVESTIGATION_RUN_1.findings.every((finding) =>
    DEMO_INVESTIGATION_RUN_2.findings.some((later) => later.id === finding.id)),
  'Run 2: all baseline findings remain present for report comparison');
  assert(DEMO_INVESTIGATION_RUN_2.findings.at(-1)?.riskLevel === 'CAUTION',
    'Run 2: disposed procedural fixture remains a review caution, not a clear result');
  checkCounts(DEMO_INVESTIGATION_RUN_2 as typeof DEMO_INVESTIGATION_RUN_1, 'Run 2');
  checkSyntheticEvidence(DEMO_INVESTIGATION_RUN_2 as typeof DEMO_INVESTIGATION_RUN_1, 'Run 2');
  assert(DEMO_INVESTIGATION_RUN_2.sourcesChecked.length > DEMO_INVESTIGATION_RUN_1.sourcesChecked.length,
    'Run 2: new synthetic evidence sources are included in the source ledger');

  const graphUrls = DEMO_ENTITY_GRAPH.edges.flatMap((edge) => edge.sourceUrls);
  assert(graphUrls.every((url) => {
    try { return new URL(url).hostname.toLowerCase().endsWith('.invalid'); }
    catch { return false; }
  }), 'Entity graph: every source link is a reserved .invalid fixture URL');
  assert(DEMO_ENTITY_GRAPH.edges.every((edge) => Boolean(edge.disclaimer)),
    'Entity graph: all relationships carry a non-inference disclaimer');
  assert(DEMO_ENTITY_GRAPH.nodes.filter((node) => node.nodeType === 'RELATED_COMPANY').every((node) => node.lightweightReviewStatus === 'UNKNOWN'),
    'Entity graph: related companies remain UNKNOWN until independently risk-scanned');
  assert(DEMO_INVESTIGATION_RUN_1.relatedLeads.every((lead) => lead.companyStatus === 'UNKNOWN'),
    'Related-lead cards do not imply clean company standing without a separate risk scan');
  assert(DEMO_INVESTIGATION_RUN_1.sourcesChecked.length === 6,
    'Run 1: source-check ledger reflects six synthetic sources across four checked dimensions');
  assert(DEMO_INVESTIGATION_RUN_1.assessmentReport?.coverageStatus === 'PARTIAL',
    'Run 1: demo report does not claim complete coverage when adverse-news dimension is absent');
  assert(DEMO_INVESTIGATION_RUN_1.assessmentReport?.coverageGaps?.some((gap) => /negative news/i.test(gap)) === true,
    'Run 1: report explains that adverse-news coverage is absent from the synthetic walkthrough');

  return { assertionsPassed, assertionsFailed, logs };
}
