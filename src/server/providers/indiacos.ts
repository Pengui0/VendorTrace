/**
 * Live IndiaCos Company Registry Provider
 * Interfaces with official IndiaCos REST API (MCA21, GSTN, LLP, and Candidate Search).
 * Strictly keeps INDIACOS_API_KEY server-side.
 * Caches low-volatility successful records (24h TTL) and never caches auth or quota failures.
 */

import {
  CompanyRegistryProvider,
  CompanyRegistryLookupResult,
  CandidateEntity,
  ResolvedCompanyProfile,
  ProviderTestResult,
} from './types.js';
import { executeHardenedRequest } from './httpClient.js';
import { registryCache } from './cache.js';


function formatIndiaCosAddress(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (!value || typeof value !== 'object') return null;
  const address = value as Record<string, unknown>;
  const parts = [
    address.address_line,
    address.line1,
    address.building,
    address.street,
    address.locality,
    address.city,
    address.district,
    address.state,
    address.pincode,
    address.pin_code,
  ].filter((part): part is string | number => typeof part === 'string' || typeof part === 'number')
    .map((part) => String(part).trim())
    .filter(Boolean);
  return parts.length ? [...new Set(parts)].join(', ') : null;
}

function extractGstins(raw: any): string[] {
  const values = [raw?.gstin, raw?.gst_number, raw?.gst_registration?.gstin, raw?.gst_registration?.gst_number,
    ...(Array.isArray(raw?.gstins) ? raw.gstins : []),
    ...(Array.isArray(raw?.gst_registrations) ? raw.gst_registrations : []),
    ...(Array.isArray(raw?.tax_registrations) ? raw.tax_registrations : [])];
  return [...new Set(values.map((item: any) => String(typeof item === 'string' ? item : item?.gstin || item?.gst_number || item?.registration_number || '').trim().toUpperCase())
    .filter((value) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(value)))];
}

export class LiveIndiaCosProvider implements CompanyRegistryProvider {
  public readonly id = 'indiacos' as const;
  public readonly name = 'IndiaCos Corporate & Tax Registry';
  private baseUrl: string;

  constructor() {
    this.baseUrl = (process.env.INDIACOS_BASE_URL || 'https://indiacos.com/api/v1').replace(/\/+$/, '');
  }

  private getApiKey(): string | null {
    const key = process.env.INDIACOS_API_KEY;
    return key && key.trim().length > 0 ? key.trim() : null;
  }

  public isConfigured(): boolean {
    return this.getApiKey() !== null;
  }

  private getAuthHeaders(): Record<string, string> {
    const key = this.getApiKey();
    if (!key) return {};
    // IndiaCos officially documents Authorization: Bearer YOUR_KEY or X-API-Key
    return {
      'Authorization': `Bearer ${key}`,
      'X-API-Key': key,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  public async testConnection(): Promise<ProviderTestResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        errorCategory: null,
        latencyMs: 0,
        message: 'INDIACOS_API_KEY is missing from server environment secrets.',
        isMock: false,
      };
    }

    const testUrl = `${this.baseUrl}/search?q=Infosys&limit=1`;
    const res = await executeHardenedRequest(testUrl, {
      method: 'GET',
      headers: this.getAuthHeaders(),
      timeoutMs: 6000,
      maxRetries: 1,
    });

    return {
      success: res.ok,
      status: res.appStatus,
      errorCategory: res.errorCategory,
      upstreamRequestId: res.upstreamRequestId,
      latencyMs: res.latencyMs,
      message: res.ok
        ? 'IndiaCos Search endpoint responded successfully; API key authentication and endpoint connectivity verified.'
        : res.errorMessage || 'Failed to connect to IndiaCos.',
      isMock: false,
    };
  }

  public async lookupByCIN(cin: string, options: { signal?: AbortSignal; timeoutMs?: number; freshRun?: boolean } = {}): Promise<CompanyRegistryLookupResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        message: 'INDIACOS_API_KEY is not configured in server secrets.',
        isMock: false,
      };
    }

    const cleanCin = cin.trim().toUpperCase();
    const cacheKey = `indiacos:cin:${cleanCin}`;

    // 1. Check registry cache (24h TTL)
    const cached = options.freshRun ? null : registryCache.get<ResolvedCompanyProfile>(cacheKey);
    if (cached) {
      return {
        success: true,
        status: 'LIVE',
        profile: { ...cached.data, isCached: true },
        isMock: false,
      };
    }

    // 2. Query the documented direct company/LLP lookup endpoint.
    const url = `${this.baseUrl}/company/${encodeURIComponent(cleanCin)}`;
    const res = await executeHardenedRequest(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      maxRetries: 0,
    });

    if (!res.ok) {
      // NOTE: Never cache auth failures, billing failures (402), or transient errors!
      return {
        success: false,
        status: res.appStatus,
        errorCategory: res.errorCategory,
        upstreamRequestId: res.upstreamRequestId,
        message: res.errorMessage,
        isMock: false,
      };
    }

    const raw = Array.isArray(res.data?.results) ? res.data.results[0] : res.data;
    const rawCin = String(raw?.cin || raw?.llpin || '').toUpperCase();
    const legalName = String(raw?.name || raw?.legal_name || raw?.company_name || '').trim();
    if (!raw || !legalName || !String(raw.status || raw.company_status || '').trim() || (rawCin !== cleanCin && String(raw?.former_cin || '').toUpperCase() !== cleanCin)) {
      return {
        success: false,
        status: 'LIVE',
        upstreamRequestId: res.upstreamRequestId,
        errorCategory: 'INVALID_RESPONSE',
        message: `IndiaCos did not return a company record validated against CIN/LLPIN ${cleanCin}.`,
        isMock: false,
      };
    }

    const entityKind = String(raw.kind || raw.entity_type || raw.entityType || '').toLowerCase();
    const isLlp = entityKind.includes('llp') || cleanCin.includes('-');

    // IndiaCos' company response normally returns directors as {count, url}, not as an inline list.
    // Fetch the documented directors endpoint so Layer 2 has real DIN anchors when available.
    let directorRows: any[] = Array.isArray(raw.directors) ? raw.directors : [];
    let directorLookupNote = '';
    const directorCount = Number(raw.directors?.count);
    if (!Array.isArray(raw.directors) && (directorCount > 0 || typeof raw.directors?.url === 'string')) {
      const directorsUrl = `${this.baseUrl}/company/${encodeURIComponent(cleanCin)}/directors`;
      const directorsRes = await executeHardenedRequest(directorsUrl, {
        method: 'GET',
        headers: this.getAuthHeaders(),
        timeoutMs: 6000,
        maxRetries: 0,
        signal: options.signal,
      });
      if (directorsRes.ok) {
        directorRows = Array.isArray(directorsRes.data?.results)
          ? directorsRes.data.results
          : Array.isArray(directorsRes.data?.directors)
          ? directorsRes.data.directors
          : [];
      } else {
        directorLookupNote = ' Director listing could not be retrieved; director tracing coverage is incomplete.';
      }
    }

    const profile: ResolvedCompanyProfile = {
      canonicalName: legalName,
      tradeName: raw.trade_name || null,
      cin: isLlp ? null : (raw.cin || cleanCin),
      llpin: isLlp ? (raw.llpin || cleanCin) : null,
      gstins: extractGstins(raw),
      pan: raw.pan || null,
      companyStatus: raw.status || raw.company_status || 'UNKNOWN',
      entityType: isLlp ? 'LLP' : 'COMPANY',
      incorporationDate: raw.incorporation_date || raw.date_of_incorporation || null,
      businessCategory: raw.category || raw.business_category || raw.company_category || null,
      classOfCompany: raw.class_of_company || raw.class || null,
      registeredOffice: formatIndiaCosAddress(raw.registered_office || raw.registered_address || raw.address),
      directors: directorRows
        .filter((d: any) => (d.din || d.director_id) && (d.name || d.director_name))
        .map((d: any) => ({
          din: String(d.din || d.director_id),
          name: String(d.name || d.director_name),
          designation: d.designation || undefined,
          appointmentDate: d.appointed || d.appointment_date || d.appointmentDate || undefined,
        })),
      charges: Array.isArray(raw.charges)
        ? raw.charges.map((c: any) => ({
            chargeId: c.charge_id || String(c.id),
            holderName: c.holder_name || c.bank_name,
            amountInr: Number(c.amount_inr || c.amount || 0),
            creationDate: c.date_of_creation,
            status: c.status || 'ACTIVE',
          }))
        : undefined,
      sourceUrl: raw.url || raw.source_url || `https://indiacos.com/company/${encodeURIComponent(cleanCin)}`,
      lastFetchedAt: new Date().toISOString(),
      sourceUpdatedAt: raw.last_updated_at || raw.updated_at || null,
      identityMatchMethod: isLlp ? 'EXACT_LLPIN' : 'EXACT_CIN',
      ambiguityNotes: `${raw.former_cin ? `Resolved by IndiaCos to the current record; former CIN on record: ${raw.former_cin}. ` : ''}Direct company/LLP record returned for the requested registry identifier.${directorLookupNote}`,
      isCached: false,
    };

    // Cache successful low-volatility profile (24 Hours)
    registryCache.set(cacheKey, profile);

    return {
      success: true,
      status: 'LIVE',
      profile,
      upstreamRequestId: res.upstreamRequestId,
      isMock: false,
    };
  }

  public async lookupByGSTIN(gstin: string, options: { signal?: AbortSignal; timeoutMs?: number; freshRun?: boolean } = {}): Promise<CompanyRegistryLookupResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        message: 'INDIACOS_API_KEY is not configured in server secrets.',
        isMock: false,
      };
    }

    const cleanGstin = gstin.trim().toUpperCase();
    const cacheKey = `indiacos:gst:${cleanGstin}`;

    // 1. Check registry cache
    const cached = options.freshRun ? null : registryCache.get<ResolvedCompanyProfile>(cacheKey);
    if (cached) {
      return {
        success: true,
        status: 'LIVE',
        profile: { ...cached.data, isCached: true },
        isMock: false,
      };
    }

    // 2. Query documented GST endpoint: GET /api/v1/gst/{gstin}
    const url = `${this.baseUrl}/gst/${encodeURIComponent(cleanGstin)}`;
    const res = await executeHardenedRequest(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      maxRetries: 0,
    });

    if (!res.ok) {
      return {
        success: false,
        status: res.appStatus,
        errorCategory: res.errorCategory,
        upstreamRequestId: res.upstreamRequestId,
        message: res.errorMessage,
        isMock: false,
      };
    }

    const raw = res.data;
    const legalName = String(raw?.legal_name || raw?.company?.name || raw?.trade_name || '').trim();
    if (!raw || String(raw.gstin || '').toUpperCase() !== cleanGstin || !legalName || !raw.status) {
      return {
        success: false,
        status: 'LIVE',
        upstreamRequestId: res.upstreamRequestId,
        errorCategory: 'INVALID_RESPONSE',
        message: `IndiaCos did not return a GST registration validated against GSTIN ${cleanGstin}.`,
        isMock: false,
      };
    }
    const constitution = raw.constitution_of_business || raw.constitution || '';
    const isProprietorship = constitution.toLowerCase().includes('proprietor');
    const isPartnership = constitution.toLowerCase().includes('partnership');
    const isLlp = constitution.toLowerCase().includes('limited liability');

    const profile: ResolvedCompanyProfile = {
      canonicalName: legalName,
      tradeName: raw.trade_name || null,
      cin: isProprietorship || isPartnership ? null : (raw.cin || raw.company?.cin || null),
      llpin: isLlp ? (raw.llpin || null) : null,
      gstins: [cleanGstin],
      pan: raw.pan || cleanGstin.substring(2, 12),
      companyStatus: raw.status,
      entityType: isProprietorship
        ? 'PROPRIETORSHIP'
        : isPartnership
        ? 'PARTNERSHIP'
        : isLlp
        ? 'LLP'
        : 'COMPANY',
      incorporationDate: raw.registration_date || raw.date_of_registration || null,
      businessCategory: constitution || 'Goods & Services Tax Registered Entity',
      registeredOffice: formatIndiaCosAddress(raw.principal_place_address || raw.address || raw.principal_place),
      sourceUrl: raw.url || raw.source_url || `https://indiacos.com/gst/${encodeURIComponent(cleanGstin)}`,
      lastFetchedAt: new Date().toISOString(),
      sourceUpdatedAt: raw.last_updated_at || null,
      identityMatchMethod: 'EXACT_GSTIN',
      ambiguityNotes: isProprietorship
        ? 'Proprietorship entity: Identified via GSTN Portal; Corporate Identification Number (CIN) does not apply.'
        : 'Exact tax jurisdiction match verified via GSTN registration portal.',
      isCached: false,
    };

    // Cache successful low-volatility profile (24 Hours)
    registryCache.set(cacheKey, profile);

    return {
      success: true,
      status: 'LIVE',
      profile,
      upstreamRequestId: res.upstreamRequestId,
      isMock: false,
    };
  }

  public async lookupByDIN(din: string, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<CompanyRegistryLookupResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        message: 'INDIACOS_API_KEY is not configured in server secrets.',
        isMock: false,
      };
    }

    const cleanDin = din.trim();
    const url = `${this.baseUrl}/director/${encodeURIComponent(cleanDin)}`;
    const res = await executeHardenedRequest(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
      timeoutMs: options.timeoutMs ?? 45000,
      maxRetries: 0,
      signal: options.signal,
    });

    if (!res.ok) {
      return {
        success: false,
        status: res.appStatus,
        errorCategory: res.errorCategory,
        upstreamRequestId: res.upstreamRequestId,
        message: res.errorMessage,
        isMock: false,
      };
    }

    const directorships = Array.isArray(res.data?.directorships) ? res.data.directorships : [];
    const associatedCompanies = directorships.flatMap((item: any) => {
      const cin = String(item.cin || item.llpin || '').trim().toUpperCase();
      const name = String(item.company || item.name || item.legal_name || '').trim();
      if (!cin || !name) return [];
      const rawLinkage = String(item.din_linked_by || item.dinLinkedBy || '').toLowerCase();
      const linkageMethod: 'record' | 'name_match' | 'unknown' = rawLinkage === 'record'
        ? 'record'
        : rawLinkage === 'name_match'
        ? 'name_match'
        : 'unknown';
      return [{
        cin,
        name,
        designation: item.designation || undefined,
        appointmentDate: item.appointed || item.appointment_date || undefined,
        sourceUrl: typeof item.url === 'string' ? item.url : null,
        linkageMethod,
      }];
    });

    const disqualificationState = res.data?.disqualified === true
      ? 'flagged'
      : res.data?.disqualified === false
      ? 'not flagged in the returned record'
      : 'not checked / unknown';

    return {
      success: true,
      status: 'LIVE',
      upstreamRequestId: res.upstreamRequestId,
      profile: {
        canonicalName: res.data?.name || `Director DIN ${cleanDin}`,
        gstins: [],
        // This is a director record, not a company status. Do not label a director as an active company.
        companyStatus: 'UNKNOWN',
        entityType: 'OTHER',
        directors: [{ din: cleanDin, name: res.data?.name || 'Director' }],
        associatedCompanies,
        sourceUrl: `${this.baseUrl}/director/${encodeURIComponent(cleanDin)}`,
        ambiguityNotes: `Director DIN lookup completed; disqualification state: ${disqualificationState}. Only directorships linked by registry record should be treated as strong identifier matches.`,
        lastFetchedAt: new Date().toISOString(),
        identityMatchMethod: 'CONFIRMED_SELECTION',
        isCached: false,
      },
      isMock: false,
    };
  }

  public async searchCandidates(query: string): Promise<{ candidates: CandidateEntity[]; upstreamRequestId?: string | null }> {
    if (!this.isConfigured()) {
      return { candidates: [] };
    }

    const url = `${this.baseUrl}/search?q=${encodeURIComponent(query.trim())}&limit=10`;
    const res = await executeHardenedRequest(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!res.ok || !res.data) {
      return { candidates: [], upstreamRequestId: res.upstreamRequestId };
    }

    const rawList = Array.isArray(res.data.results)
      ? res.data.results
      : Array.isArray(res.data)
      ? res.data
      : [];

    const candidates: CandidateEntity[] = rawList.flatMap((item: any, idx: number) => {
      const cin = item.cin || item.identifier || null;
      const gstin = item.gstin || null;
      const llpin = item.llpin || (String(item.type || '').toLowerCase().includes('llp') ? item.identifier : null);
      const pan = item.pan || null;
      const identifierType: CandidateEntity['identifierType'] | null = cin
        ? 'CIN'
        : llpin
        ? 'LLPIN'
        : gstin
        ? 'GSTIN'
        : pan
        ? 'PAN'
        : null;
      const identifierValue = cin || llpin || gstin || pan;
      const legalName = item.name || item.legal_name || item.trade_name;
      if (!identifierType || !identifierValue || !legalName) return [];

      const itemType = String(item.type || item.entity_type || '').toLowerCase();
      const entityType: CandidateEntity['entityType'] = itemType.includes('llp') || llpin
        ? 'LLP'
        : itemType.includes('company') || cin
        ? 'COMPANY'
        : itemType.includes('gst')
        ? 'OTHER'
        : 'OTHER';
      const stableId = `${identifierType.toLowerCase()}_${String(identifierValue).replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
      return [{
        id: `cand_${stableId || idx}`,
        canonicalName: String(legalName),
        tradeName: item.trade_name || undefined,
        identifierType,
        identifierValue: String(identifierValue),
        companyStatus: item.status || 'UNKNOWN',
        entityType,
        registeredAddress: formatIndiaCosAddress(item.registered_office || item.registered_address || item.address),
        state: item.state || null,
        sourceUrl: item.url || item.source_url || null,
        identityMatchMethod: 'NAME_MATCH',
        ambiguityNote: 'Registry search candidate only. Confirm the exact identifier before treating this as the target entity.',
      }];
    });

    return {
      candidates,
      upstreamRequestId: res.upstreamRequestId,
    };
  }

  /**
   * Finds company records sharing a registered address via the documented address search + office endpoints.
   * A shared office is only a candidate relationship, never a finding of common control or misconduct.
   */
  public async searchBusinessesAtAddress(address: string, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<{
    candidates: CandidateEntity[];
    addressId?: string;
    sourceUrl?: string;
    addressLabel?: string;
    message?: string;
  }> {
    if (!this.isConfigured()) {
      return { candidates: [], message: 'INDIACOS_API_KEY is not configured in server secrets.' };
    }
    const cleanAddress = address.trim();
    if (cleanAddress.length < 8) {
      return { candidates: [], message: 'Address is too short for a meaningful shared-office lookup.' };
    }

    const searchUrl = new URL(`${this.baseUrl}/search`);
    searchUrl.searchParams.set('q', cleanAddress);
    searchUrl.searchParams.set('type', 'address');
    searchUrl.searchParams.set('limit', '5');
    const searchRes = await executeHardenedRequest(searchUrl.toString(), {
      method: 'GET',
      headers: this.getAuthHeaders(),
      timeoutMs: options.timeoutMs ?? 45000,
      maxRetries: 0,
      signal: options.signal,
    });
    if (!searchRes.ok) {
      return { candidates: [], message: searchRes.errorMessage || 'IndiaCos shared-address search failed.' };
    }

    const rows = Array.isArray(searchRes.data?.results) ? searchRes.data.results : [];
    const extractOfficeId = (item: any): string | null => {
      const directId = item?.office_id ?? item?.address_id ?? item?.id;
      if (typeof directId === 'number' && Number.isSafeInteger(directId) && directId > 0) return String(directId);
      if (typeof directId === 'string' && /^\d{1,12}$/.test(directId) && Number(directId) > 0) return directId;
      for (const value of [item?.url, item?.api, item?.source_url]) {
        if (typeof value !== 'string') continue;
        const match = value.match(/\/office\/(\d+)(?:[/?#]|$)/i);
        if (match && Number(match[1]) > 0) return match[1];
      }
      return null;
    };
    const addressHit = rows.find((item: any) => Boolean(extractOfficeId(item)));
    if (!addressHit) {
      return {
        candidates: [],
        message: 'IndiaCos returned no address identifier for this address. No related companies were inferred.',
      };
    }

    const addressId = extractOfficeId(addressHit)!;
    const officeRes = await executeHardenedRequest(`${this.baseUrl}/office/${encodeURIComponent(addressId)}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
      timeoutMs: options.timeoutMs ?? 45000,
      maxRetries: 0,
      signal: options.signal,
    });
    if (!officeRes.ok) {
      return { candidates: [], addressId, message: officeRes.errorMessage || 'IndiaCos shared-office lookup failed.' };
    }

    const businesses = Array.isArray(officeRes.data?.results) ? officeRes.data.results : [];
    const candidates: CandidateEntity[] = businesses.flatMap((item: any) => {
      // Keep this relationship graph restricted to corporate identities with a real CIN.
      const cin = String(item.cin || '').trim().toUpperCase();
      const name = String(item.name || item.legal_name || item.company_name || '').trim();
      if (!cin || !name) return [];
      return [{
        id: `cand_cin_${cin.replace(/[^A-Z0-9]/g, '').toLowerCase()}`,
        canonicalName: name,
        identifierType: 'CIN' as const,
        identifierValue: cin,
        companyStatus: item.status || 'UNKNOWN',
        entityType: 'COMPANY' as const,
        registeredAddress: formatIndiaCosAddress(item.registered_office || item.address) || cleanAddress,
        state: item.state || null,
        sourceUrl: typeof item.url === 'string' ? item.url : typeof item.source_url === 'string' ? item.source_url : undefined,
        identityMatchMethod: 'EXACT_IDENTIFIER' as const,
        ambiguityNote: 'Shared registered-address lead only; a common office does not prove common ownership, control, liability or misconduct.',
      }];
    });

    return {
      candidates,
      addressId,
      sourceUrl: typeof officeRes.data?.url === 'string'
        ? officeRes.data.url
        : `${this.baseUrl}/office/${encodeURIComponent(addressId)}`,
      addressLabel: formatIndiaCosAddress(officeRes.data?.address) || formatIndiaCosAddress(addressHit.address) || cleanAddress,
    };
  }

  public async lookupCases(
    cinOrIdentifier: string,
    options: { signal?: AbortSignal; timeoutMs?: number; identifierType?: 'CIN' | 'GSTIN'; freshRun?: boolean } = {}
  ): Promise<import('./types.js').CompanyLitigationLookupResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        cases: [],
        message: 'INDIACOS_API_KEY is not configured in server secrets.',
        isMock: false,
      };
    }

    const cleanId = cinOrIdentifier.trim().toUpperCase();
    const identifierType = options.identifierType || 'CIN';
    const cacheKey = `indiacos:cases:${identifierType}:${cleanId}`;
    const cached = options.freshRun ? null : registryCache.get<import('./types.js').LitigationCaseItem[]>(cacheKey);
    if (cached) {
      return {
        success: true,
        status: 'LIVE',
        cases: cached.data,
        isMock: false,
      };
    }

    // Documented case endpoints exist for both company CIN and GSTIN identifiers.
    const endpoint = identifierType === 'GSTIN' ? 'gst' : 'company';
    const url = `${this.baseUrl}/${endpoint}/${encodeURIComponent(cleanId)}/cases`;
    const res = await executeHardenedRequest(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
      timeoutMs: options.timeoutMs ?? 45000,
      maxRetries: 0,
      signal: options.signal,
    });

    if (!res.ok) {
      return {
        success: false,
        status: res.appStatus,
        errorCategory: res.errorCategory,
        upstreamRequestId: res.upstreamRequestId,
        cases: [],
        message: res.errorMessage || `Endpoint ${url} returned ${res.status}. Falling back to unstructured research.`,
        isMock: false,
      };
    }

    const rawCases = Array.isArray(res.data?.cases) ? res.data.cases : Array.isArray(res.data?.recent) ? res.data.recent : Array.isArray(res.data) ? res.data : [];
    const textValue = (...values: unknown[]) => values.find((value) => typeof value === 'string' && value.trim()) as string | undefined;
    const partyValue = (value: any): string | undefined => textValue(value, value?.name, value?.party_name, value?.company_name);
    const cases: import('./types.js').LitigationCaseItem[] = rawCases.flatMap((c: any) => {
      if (!c || typeof c !== 'object' || Array.isArray(c)) return [];
      const caseId = textValue(c.case_id, c.caseId, c.id, c.uid);
      const caseTitle = textValue(c.case_title, c.title, c.case_name, c.name);
      const courtName = textValue(c.court_name, c.court, c.courtName, c.court_location);
      const caseNumber = textValue(c.case_number, c.cnr_number, c.cnr, c.number);
      const petitioner = partyValue(c.petitioner || c.petitioner_name || c.applicant);
      const respondent = partyValue(c.respondent || c.respondent_name || c.opposite_party);
      const matchedParty = partyValue(c.matched_party || c.matchedParty || c.party);
      const rawParties = Array.isArray(c.parties) ? c.parties.map(partyValue).filter(Boolean) as string[] : [];
      const parties = [...new Set([...rawParties, petitioner, respondent, matchedParty].filter((value): value is string => Boolean(value)))];
      const caseDate = textValue(c.case_date, c.date, c.filing_date, c.filed_on);
      const rawStatus = String(c.status || c.case_status || c.stage || '').trim().toLowerCase();
      const allowedStatuses = ['alleged', 'pending', 'dismissed', 'disposed', 'settled', 'confirmed'];
      const sourceUrl = textValue(c.source_url, c.url, c.case_url);
      let safeSourceUrl: string | undefined;
      if (sourceUrl) {
        try {
          const parsed = new URL(sourceUrl);
          if (parsed.protocol === 'https:' || parsed.protocol === 'http:') safeSourceUrl = parsed.toString();
        } catch { /* malformed provider URLs are omitted */ }
      }
      const item: import('./types.js').LitigationCaseItem = {
        ...(caseId ? { caseId } : {}),
        ...(caseTitle ? { caseTitle } : {}),
        ...(courtName ? { courtName } : {}),
        ...(caseNumber ? { caseNumber } : {}),
        ...(textValue(c.filing_year, c.year) ? { filingYear: textValue(c.filing_year, c.year) } : {}),
        status: allowedStatuses.includes(rawStatus) ? rawStatus as any : 'unknown',
        ...(textValue(c.snippet, c.summary, c.description) ? { snippet: textValue(c.snippet, c.summary, c.description) } : {}),
        ...(safeSourceUrl ? { sourceUrl: safeSourceUrl } : {}),
        ...(textValue(c.last_updated, c.updated_at) ? { lastUpdated: textValue(c.last_updated, c.updated_at) } : {}),
        ...(caseDate ? { caseDate } : {}),
        ...(petitioner ? { petitioner } : {}),
        ...(respondent ? { respondent } : {}),
        ...(parties.length ? { parties } : {}),
        ...(matchedParty ? { matchedParty } : {}),
      };
      return [item];
    });

    if (cases.length > 0) {
      registryCache.set(cacheKey, cases);
    }

    return {
      success: true,
      status: 'LIVE',
      cases,
      summary: {
        ...(Number.isFinite(Number(res.data?.respondent?.total)) ? { respondentTotal: Number(res.data.respondent.total) } : {}),
        ...(Number.isFinite(Number(res.data?.respondent?.pending)) ? { respondentPending: Number(res.data.respondent.pending) } : {}),
        ...(Number.isFinite(Number(res.data?.petitioner?.total)) ? { petitionerTotal: Number(res.data.petitioner.total) } : {}),
        ...(res.data?.flags && typeof res.data.flags === 'object' ? { flags: res.data.flags } : {}),
      },
      upstreamRequestId: res.upstreamRequestId,
      isMock: false,
    };
  }
}

export const indiacos = new LiveIndiaCosProvider();
