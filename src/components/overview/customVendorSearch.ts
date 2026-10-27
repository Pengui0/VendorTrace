import type { CandidateEntity } from '../../server/providers/types.js';

export interface CustomVendorSearchInput {
  legalName: string;
  cin: string;
  gstin: string;
  websiteUrl: string;
}

export interface CustomResolverPayload extends CustomVendorSearchInput {
  query: string;
  useMock: boolean;
  selectedCandidate?: CandidateEntity;
}

export function openCustomVendorSearch(setTab: (tab: 'investigations') => void, setSubTab: (tab: 'resolution') => void) {
  setTab('investigations');
  setSubTab('resolution');
}

export function buildCustomResolverPayload(input: CustomVendorSearchInput, useMock: boolean, selectedCandidate?: CandidateEntity): CustomResolverPayload {
  const legalName = input.legalName.trim();
  const cin = input.cin.trim().toUpperCase();
  const gstin = input.gstin.trim().toUpperCase();
  const websiteUrl = input.websiteUrl.trim();
  if (!legalName && !cin && !gstin) throw new Error('Enter a company legal name, CIN, or GSTIN to search.');
  if (cin && !/^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(cin)) throw new Error('Enter a valid 21-character CIN.');
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) throw new Error('Enter a valid 15-character GSTIN.');
  if (websiteUrl) {
    try {
      const parsed = new URL(websiteUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error();
    } catch { throw new Error('Enter a valid public website URL beginning with http:// or https://.'); }
  }
  return { legalName, cin, gstin, websiteUrl, query: cin || gstin || legalName, useMock, ...(selectedCandidate ? { selectedCandidate } : {}) };
}

export function isValidCandidate(value: unknown): value is CandidateEntity {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as CandidateEntity;
  return typeof candidate.id === 'string' && candidate.id.length > 0
    && typeof candidate.canonicalName === 'string' && candidate.canonicalName.trim().length > 0
    && ['CIN', 'LLPIN', 'GSTIN', 'PAN'].includes(candidate.identifierType)
    && typeof candidate.identifierValue === 'string' && candidate.identifierValue.trim().length > 0
    && typeof candidate.companyStatus === 'string' && typeof candidate.entityType === 'string';
}

export function resolutionModeLabel(isMock: boolean): 'Demo fixture' | 'Live provider' {
  return isMock ? 'Demo fixture' : 'Live provider';
}

export function profileMatchesCandidate(profile: { canonicalName?: string; cin?: string | null; llpin?: string | null; gstins?: string[]; pan?: string | null }, candidate: CandidateEntity): boolean {
  const nameMatches = (profile.canonicalName || '').trim().toLocaleLowerCase() === candidate.canonicalName.trim().toLocaleLowerCase();
  let identifierMatches = false;
  switch (candidate.identifierType) {
    case 'CIN': identifierMatches = (profile.cin || '').toUpperCase() === candidate.identifierValue.toUpperCase(); break;
    case 'LLPIN': identifierMatches = (profile.llpin || '').replace(/-/g, '').toUpperCase() === candidate.identifierValue.replace(/-/g, '').toUpperCase(); break;
    case 'GSTIN': identifierMatches = (profile.gstins || []).some((value) => value.toUpperCase() === candidate.identifierValue.toUpperCase()); break;
    case 'PAN': identifierMatches = (profile.pan || '').toUpperCase() === candidate.identifierValue.toUpperCase(); break;
  }
  return nameMatches && identifierMatches;
}
