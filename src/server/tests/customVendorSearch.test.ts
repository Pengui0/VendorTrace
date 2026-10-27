import { buildCustomResolverPayload, isValidCandidate, openCustomVendorSearch, profileMatchesCandidate, resolutionModeLabel } from '../../components/overview/customVendorSearch.js';
import type { CandidateEntity } from '../providers/types.js';

export async function runCustomVendorSearchTests() {
  let assertionsPassed = 0;
  let assertionsFailed = 0;
  const details: string[] = [];
  const assert = (ok: boolean, message: string) => {
    if (ok) { assertionsPassed++; details.push(`[PASS] ${message}`); }
    else { assertionsFailed++; details.push(`[FAIL] ${message}`); }
  };
  const navigation: string[] = [];
  openCustomVendorSearch((tab) => navigation.push(tab), (tab) => navigation.push(tab));
  assert(navigation.join('/') === 'investigations/resolution', 'Custom Vendor Search button route opens the resolver form');

  const request = buildCustomResolverPayload({ legalName: 'Example Industries Limited', cin: 'L27100MH1907PLC000260', gstin: '', websiteUrl: 'https://example.test' }, false);
  assert(request.query === 'L27100MH1907PLC000260' && request.legalName === 'Example Industries Limited' && request.websiteUrl === 'https://example.test' && request.useMock === false, 'Custom company fields reach the server resolver payload in selected Live mode');

  let missingError = false;
  try { buildCustomResolverPayload({ legalName: '', cin: '', gstin: '', websiteUrl: '' }, true); } catch { missingError = true; }
  assert(missingError, 'Missing company name and identifiers produce a validation error');

  const candidate: CandidateEntity = { id: 'candidate-1', canonicalName: 'Example Industries Limited', identifierType: 'CIN', identifierValue: 'L27100MH1907PLC000260', companyStatus: 'ACTIVE', entityType: 'COMPANY', identityMatchMethod: 'NAME_MATCH' };
  assert(isValidCandidate(candidate) && !isValidCandidate({ ...candidate, identifierType: 'invalid' }), 'Resolver candidates are validated before user selection');
  assert(profileMatchesCandidate({ canonicalName: candidate.canonicalName, cin: candidate.identifierValue }, candidate) && !profileMatchesCandidate({ canonicalName: candidate.canonicalName, cin: 'different' }, candidate), 'Selected company response must match candidate name and identifier');
  assert(resolutionModeLabel(true) === 'Demo fixture' && resolutionModeLabel(false) === 'Live provider', 'Synthetic demo fixtures cannot be labeled as live provider results');
  return { assertionsPassed, assertionsFailed, details };
}
