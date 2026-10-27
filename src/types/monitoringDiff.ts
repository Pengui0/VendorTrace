/**
 * VendorTrace Change Detection, Signal Fingerprinting & Monitoring Contracts
 * Enforces deterministic signal hashing, honest 'not observed' statuses, and diff tracking.
 */

import { RiskFinding } from './riskFinding.js';

export type SignalDiffType =
  | 'NEW'
  | 'CHANGED'
  | 'NOT_OBSERVED_IN_LATEST'
  | 'RESOLVED_BY_SOURCE'
  | 'UNRESOLVED_AMBIGUOUS';

export interface FieldChange {
  field: string;
  previousValue: any;
  currentValue: any;
  previousEvidenceDate?: string | null;
  currentEvidenceDate?: string | null;
}

export interface SignalDiffItem {
  id: string;
  fingerprint: string;
  diffType: SignalDiffType;
  title: string;
  dimension: string;
  currentSignal?: RiskFinding | null;
  previousSignal?: RiskFinding | null;
  changes: FieldChange[];
  explanation: string;
  needsHumanReview: boolean;
  statusBadge: string;
}

export interface RunComparisonReport {
  comparisonId: string;
  previousInvestigationId: string;
  previousRunDate: string;
  latestInvestigationId: string;
  latestRunDate: string;
  vendorId: string;
  vendorName: string;
  comparedAt: string;
  newSignals: SignalDiffItem[];
  changedSignals: SignalDiffItem[];
  notObservedSignals: SignalDiffItem[];
  unresolvedSignals: SignalDiffItem[];
  stats: {
    totalNew: number;
    totalChanged: number;
    totalNotObserved: number;
    totalUnresolved: number;
    isIdentical: boolean;
  };
  summary: string;
  schedulingNotice: string;
}

export type MonitoringFrequencyPreference =
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'MANUAL_ONLY';

export interface MonitoringConfig {
  vendorId: string;
  preference: MonitoringFrequencyPreference;
  status: 'SCHEDULING_NOT_ENABLED_IN_THIS_DEPLOYMENT' | 'ACTIVE';
  lastCheckedAt: string | null;
  nextScheduledCheck: string | null;
  notice: string;
}
