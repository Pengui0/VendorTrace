import { validateInvestigationComparison } from '../../utils/investigationComparison.js';

interface TestResult { assertionsPassed: number; assertionsFailed: number; logs: string[]; }

export async function runInvestigationComparisonTests(): Promise<TestResult> {
  const logs: string[] = [];
  let assertionsPassed = 0;
  const assert = (condition: boolean, message: string) => {
    if (!condition) throw new Error(`Investigation comparison assertion failed: ${message}`);
    assertionsPassed += 1;
    logs.push(`[PASS] ${message}`);
  };
  const first = { id: 'inv-1', targetName: 'Example Vendor Ltd', identifierType: 'CIN', identifierValue: 'L12345MH2020PLC123456', normalizedFindings: [] };
  const second = { ...first, id: 'inv-2' };
  assert(validateInvestigationComparison(first, second) === null, 'Different reports for the same vendor with normalized findings are comparable');
  assert(validateInvestigationComparison(first, first)?.status === 400, 'The same run cannot be compared with itself');
  assert(validateInvestigationComparison(first, { ...second, identifierValue: 'L99999MH2020PLC123456' })?.status === 400, 'Different vendors cannot be compared as signal deltas');
  assert(validateInvestigationComparison(first, { ...second, normalizedFindings: undefined })?.status === 422, 'A report without normalized findings reports a clear comparison blocker');
  assert(validateInvestigationComparison(first, null)?.message.includes('Select both') === true, 'Missing report selections produce a visible action message');
  return { assertionsPassed, assertionsFailed: 0, logs };
}
