import { getAssessmentDisplayValues, getAssessmentTrend } from '../../utils/assessmentDisplay.js';

interface TestResult { assertionsPassed: number; assertionsFailed: number; logs: string[]; }

export async function runAssessmentDisplayTests(): Promise<TestResult> {
  const logs: string[] = [];
  let assertionsPassed = 0;
  const assert = (condition: boolean, message: string) => {
    if (!condition) throw new Error(`Assessment display assertion failed: ${message}`);
    assertionsPassed += 1;
    logs.push(`[PASS] ${message}`);
  };

  const current = { scoreBreakdown: { totalScore: 37 }, reviewPriority: 'REVIEW_RECOMMENDED' } as any;
  const legacy = { explainableRiskScore: 37, overallReviewPriority: 'REVIEW_RECOMMENDED' } as any;
  assert(getAssessmentDisplayValues(current).riskScore === 37, 'Current score breakdown appears in profile metrics');
  assert(getAssessmentDisplayValues(legacy).riskScore === 37, 'Legacy explainable score remains visible in profile metrics');
  assert(getAssessmentDisplayValues(legacy).priority === 'REVIEW_RECOMMENDED', 'Legacy priority alias remains visible');
  assert(getAssessmentTrend(current, { scoreBreakdown: { totalScore: 20 } } as any, 2) === 'DETERIORATING', 'Higher latest score is marked deteriorating');
  assert(getAssessmentTrend(current, { scoreBreakdown: { totalScore: 55 } } as any, 2) === 'IMPROVING', 'Lower latest score is marked improving');
  assert(getAssessmentTrend(current, { scoreBreakdown: { totalScore: 37 } } as any, 2) === 'STABLE', 'Equal available scores are marked stable');
  assert(getAssessmentTrend(current, null, 1) === 'BASELINE', 'A single report is labeled baseline');
  assert(getAssessmentTrend(current, {} as any, 2) === 'NOT_AVAILABLE', 'Missing comparison scores are not mislabeled stable');

  return { assertionsPassed, assertionsFailed: 0, logs };
}
