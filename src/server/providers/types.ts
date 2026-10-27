/**
 * Typed Provider Interfaces & Health Types for VendorTrace
 * Strict isolation of server-only secrets, safe redaction, and standardized error categories.
 */

export type ProviderAppStatus =
  | 'LIVE'
  | 'CONFIGURED'
  | 'NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'BILLING_REQUIRED'
  | 'AUTH_FAILED'
  | 'DEMO_DATA';

export type ProviderErrorCategory =
  | 'AUTH'
  | 'BILLING'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'UPSTREAM_5XX'
  | 'INVALID_INPUT'
  | 'INVALID_RESPONSE'
  | 'NOT_CONFIGURED'
  | null;

/**
 * Public/Safe Integration Health Model
 * Guaranteed to NEVER expose secret values, headers, or sensitive payloads.
 */
export interface IntegrationHealth {
  providerId: 'indiacos' | 'tinyfish';
  providerName: string;
  configured: boolean;
  status: ProviderAppStatus;
  lastCheckedAt: string | null;
  errorCategory?: ProviderErrorCategory;
  upstreamRequestId?: string | null;
  latencyMs?: number;
  message?: string;
  isMock: boolean;
  maskedKeySnippet?: string; // e.g. "••••••••" or "Present in server env"
}

export interface ProviderTestResult {
  success: boolean;
  status: ProviderAppStatus;
  errorCategory?: ProviderErrorCategory;
  upstreamRequestId?: string | null;
  latencyMs: number;
  message: string;
  isMock: boolean;
}

export interface CandidateEntity {
  id: string;
  canonicalName: string;
  tradeName?: string;
  identifierType: 'CIN' | 'LLPIN' | 'GSTIN' | 'PAN';
  identifierValue: string;
  companyStatus: string;
  entityType: 'COMPANY' | 'LLP' | 'PROPRIETORSHIP' | 'PARTNERSHIP' | 'OTHER';
  registeredAddress?: string | null;
  state?: string | null;
  sourceUrl?: string | null;
  identityMatchMethod: 'EXACT_IDENTIFIER' | 'NAME_MATCH';
  ambiguityNote?: string;
}

export interface ResolvedCompanyProfile {
  canonicalName: string;
  tradeName?: string | null;
  cin?: string | null;
  llpin?: string | null;
  gstins: string[];
  pan?: string | null;
  companyStatus: string;
  entityType: 'COMPANY' | 'LLP' | 'PROPRIETORSHIP' | 'PARTNERSHIP' | 'OTHER';
  incorporationDate?: string | null;
  businessCategory?: string | null;
  classOfCompany?: string | null;
  registeredOffice?: string | null;
  directors?: Array<{
    din: string;
    name: string;
    designation?: string;
    appointmentDate?: string;
  }>;
  /** Companies linked to a DIN by the registry provider; linkage method is preserved for confidence labeling. */
  associatedCompanies?: Array<{
    cin: string;
    name: string;
    designation?: string;
    appointmentDate?: string;
    sourceUrl?: string | null;
    linkageMethod?: 'record' | 'name_match' | 'unknown';
  }>;
  charges?: Array<{
    chargeId: string;
    holderName: string;
    amountInr: number;
    creationDate?: string;
    status: string;
  }>;
  sourceUrl?: string | null;
  lastFetchedAt: string;
  sourceUpdatedAt?: string | null;
  identityMatchMethod: 'EXACT_CIN' | 'EXACT_LLPIN' | 'EXACT_GSTIN' | 'CONFIRMED_SELECTION' | 'NAME_MATCH';
  ambiguityNotes?: string | null;
  isCached: boolean;
}

export interface CompanyRegistryLookupResult {
  success: boolean;
  status: ProviderAppStatus;
  profile?: ResolvedCompanyProfile;
  candidates?: CandidateEntity[];
  requiresDisambiguation?: boolean;
  upstreamRequestId?: string | null;
  errorCategory?: ProviderErrorCategory;
  message?: string;
  isMock: boolean;
}

export interface WebInvestigationSearchResult {
  success: boolean;
  status: ProviderAppStatus;
  query?: string;
  evidenceOutcome?: 'MATCH_FOUND' | 'NO_MATCH_FOUND_IN_SEARCHED_SOURCES' | 'SOURCE_UNAVAILABLE';
  sourceErrors?: Array<{ url: string; error: string }>;
  articles?: Array<{
    title: string;
    url: string;
    snippet: string;
    sourceDomain: string;
    publishedDate?: string;
    retrievedAt?: string;
    query?: string;
    identityMatchNote?: string;
    matchStatus?: 'MATCH_FOUND' | 'UNVERIFIED' | 'NO_MATCH';
    expandedText?: string;
    directSourceAvailable?: boolean;
    sourceFetchError?: string;
  }>;
  upstreamRequestId?: string | null;
  errorCategory?: ProviderErrorCategory;
  message?: string;
  isMock: boolean;
}

export interface LitigationCaseItem {
  caseId?: string;
  caseTitle?: string;
  courtName?: string;
  caseNumber?: string;
  filingYear?: string;
  status: 'alleged' | 'pending' | 'dismissed' | 'disposed' | 'settled' | 'confirmed' | 'unknown';
  snippet?: string;
  sourceUrl?: string;
  lastUpdated?: string;
  caseDate?: string;
  petitioner?: string;
  respondent?: string;
  parties?: string[];
  matchedParty?: string;
}

export interface CompanyLitigationLookupResult {
  success: boolean;
  status: ProviderAppStatus;
  cases: LitigationCaseItem[];
  summary?: { respondentTotal?: number; respondentPending?: number; petitionerTotal?: number; flags?: Record<string, number> };
  upstreamRequestId?: string | null;
  errorCategory?: ProviderErrorCategory;
  message?: string;
  isMock: boolean;
}

/**
 * Provider Interface: Company Registry (IndiaCos)
 */
export interface CompanyRegistryProvider {
  readonly id: 'indiacos';
  readonly name: string;
  isConfigured(): boolean;
  testConnection(): Promise<ProviderTestResult>;
  lookupByCIN(cin: string): Promise<CompanyRegistryLookupResult>;
  lookupByGSTIN(gstin: string): Promise<CompanyRegistryLookupResult>;
  lookupByDIN(din: string): Promise<CompanyRegistryLookupResult>;
  lookupCases?(cinOrIdentifier: string, options?: { signal?: AbortSignal; timeoutMs?: number; identifierType?: 'CIN' | 'GSTIN' }): Promise<CompanyLitigationLookupResult>;
  searchCandidates(query: string): Promise<{ candidates: CandidateEntity[]; upstreamRequestId?: string | null }>;
}

/**
 * Provider Interface: Web & Adverse Media Investigation (TinyFish)
 */
export interface WebInvestigationProvider {
  readonly id: 'tinyfish';
  readonly name: string;
  isConfigured(): boolean;
  testConnection(): Promise<ProviderTestResult>;
  searchAdverseMedia(entityName: string, options?: { limit?: number; identifiers?: string[]; signal?: AbortSignal; timeoutMs?: number; freshRun?: boolean }): Promise<WebInvestigationSearchResult>;
  searchDebarment?(entityName: string, options?: { limit?: number; identifiers?: string[]; signal?: AbortSignal; timeoutMs?: number; freshRun?: boolean }): Promise<WebInvestigationSearchResult>;
  searchLitigationContext?(entityName: string, options?: { limit?: number }): Promise<WebInvestigationSearchResult>;
}
