import { AssessmentReport, ReviewPriority } from '../types/crossValidation.js';

export interface AssessmentDisplayValues {
  riskScore: number | null;
  priority: ReviewPriority | null;
  priorityLabel: string;
}

export type AssessmentTrend = 'DETERIORATING' | 'IMPROVING' | 'STABLE' | 'BASELINE' | 'NOT_AVAILABLE';

export function getAssessmentDisplayValues(assessment?: AssessmentReport | null): AssessmentDisplayValues {
  const score = assessment?.scoreBreakdown?.totalScore ?? assessment?.explainableRiskScore;
  const priority = assessment?.reviewPriority ?? assessment?.overallReviewPriority ?? null;
  return {
    riskScore: typeof score === 'number' && Number.isFinite(score) ? score : null,
    priority,
    priorityLabel: priority ? priority.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Not Calculated',
  };
}

export function getAssessmentTrend(latest?: AssessmentReport | null, previous?: AssessmentReport | null, reportCount = 1): AssessmentTrend {
  if (reportCount < 2 || !previous) return 'BASELINE';
  const latestScore = getAssessmentDisplayValues(latest).riskScore;
  const previousScore = getAssessmentDisplayValues(previous).riskScore;
  if (latestScore === null || previousScore === null) return 'NOT_AVAILABLE';
  if (latestScore > previousScore) return 'DETERIORATING';
  if (latestScore < previousScore) return 'IMPROVING';
  return 'STABLE';
}
