import { getInvestigationIdentityKey } from './investigationIdentity.js';

export interface ComparableInvestigation {
  id: string;
  targetName: string;
  identifierType: string;
  identifierValue: string;
  requestedIdentifier?: { type?: string; value?: string };
  normalizedFindings?: unknown[];
}

export interface ComparisonValidationError {
  status: 400 | 422;
  message: string;
}

export function validateInvestigationComparison(
  previous: ComparableInvestigation | null | undefined,
  latest: ComparableInvestigation | null | undefined,
): ComparisonValidationError | null {
  if (!previous || !latest) return { status: 400, message: 'Select both a baseline and a latest investigation.' };
  if (previous.id === latest.id) return { status: 400, message: 'Choose two different investigation runs.' };
  if (getInvestigationIdentityKey(previous) !== getInvestigationIdentityKey(latest)) {
    return { status: 400, message: 'Choose two reports for the same vendor to compare signal changes.' };
  }
  if (!Array.isArray(previous.normalizedFindings) || !Array.isArray(latest.normalizedFindings)) {
    return { status: 422, message: 'One or both reports do not contain normalized findings for comparison. Choose another report or re-run the investigation.' };
  }
  return null;
}
