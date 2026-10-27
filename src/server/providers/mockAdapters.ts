/**
 * Mock Provider Adapters for Automated Testing & Demo Modes
 * Guaranteed to label mock outputs as "DEMO_DATA" - NEVER "LIVE".
 */

import {
  CompanyRegistryProvider,
  CompanyRegistryLookupResult,
  CandidateEntity,
  ResolvedCompanyProfile,
  WebInvestigationProvider,
  WebInvestigationSearchResult,
  ProviderTestResult,
  ProviderAppStatus,
  ProviderErrorCategory,
} from './types.js';
import {
  TATA_STEEL_CIN_FIXTURE,
  PROPRIETORSHIP_GSTIN_FIXTURE,
  LLPIN_FIXTURE,
  MULTI_CANDIDATE_SEARCH_FIXTURE,
} from './fixtures/indiacosFixtures.js';

export interface MockSimulationConfig {
  forceStatus?: ProviderAppStatus;
  forceErrorCategory?: ProviderErrorCategory;
  forceLatencyMs?: number;
  forceErrorMessage?: string;
  simulateTimeout?: boolean;
}

export class MockCompanyRegistryProvider implements CompanyRegistryProvider {
  public readonly id = 'indiacos' as const;
  public readonly name = 'IndiaCos Corporate & Tax Registry (Mock Adapter)';
  private isKeySet = true;
  private config: MockSimulationConfig = {};

  constructor(isConfigured = true, config: MockSimulationConfig = {}) {
    this.isKeySet = isConfigured;
    this.config = config;
  }

  public setConfig(config: MockSimulationConfig) {
    this.config = config;
  }

  public setConfigured(isConfigured: boolean) {
    this.isKeySet = isConfigured;
  }

  public isConfigured(): boolean {
    return this.isKeySet;
  }

  public async testConnection(): Promise<ProviderTestResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        errorCategory: null,
        latencyMs: 0,
        message: 'INDIACOS_API_KEY is missing from server environment secrets.',
        isMock: true,
      };
    }

    if (this.config.simulateTimeout) {
      return {
        success: false,
        status: 'UPSTREAM_UNAVAILABLE',
        errorCategory: 'TIMEOUT',
        latencyMs: 7000,
        message: 'Request timed out after 7000ms. Upstream service took too long to respond.',
        isMock: true,
      };
    }

    if (this.config.forceStatus && this.config.forceStatus !== 'LIVE' && this.config.forceStatus !== 'DEMO_DATA') {
      return {
        success: false,
        status: this.config.forceStatus,
        errorCategory: this.config.forceErrorCategory || 'NETWORK',
        latencyMs: this.config.forceLatencyMs || 85,
        message: this.config.forceErrorMessage || `Simulated ${this.config.forceStatus} error`,
        isMock: true,
      };
    }

    return {
      success: true,
      status: 'DEMO_DATA',
      errorCategory: null,
      upstreamRequestId: 'mock_req_ind_9921',
      latencyMs: this.config.forceLatencyMs || 45,
      message: 'Mock connection successful. Returning synthetic MCA21 / GSTN-shaped fixture data; no live registry was queried.',
      isMock: true,
    };
  }

  public async lookupByCIN(cin: string): Promise<CompanyRegistryLookupResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        message: 'INDIACOS_API_KEY is not configured.',
        isMock: true,
      };
    }

    if (this.config.forceStatus && this.config.forceStatus !== 'LIVE' && this.config.forceStatus !== 'DEMO_DATA') {
      return {
        success: false,
        status: this.config.forceStatus,
        errorCategory: this.config.forceErrorCategory || 'NETWORK',
        message: this.config.forceErrorMessage || `Simulated ${this.config.forceStatus} error`,
        isMock: true,
      };
    }

    const cleanCin = cin.trim().toUpperCase();
    const normalizedLlp = cleanCin.replace(/[^A-Z0-9]/g, '');
    const fixtureLlp = LLPIN_FIXTURE.llpin.replace(/[^A-Z0-9]/g, '');

    // Only exact fixture identifiers may resolve to a named fixture. Arbitrary
    // user input must never be silently mapped to a famous company or a made-up
    // active registration in demo mode.
    if (normalizedLlp === fixtureLlp) {
      return {
        success: true,
        status: 'DEMO_DATA',
        upstreamRequestId: 'mock_req_llp_11',
        isMock: true,
        profile: {
          canonicalName: LLPIN_FIXTURE.legal_name,
          tradeName: LLPIN_FIXTURE.trade_name,
          cin: null,
          llpin: cleanCin,
          gstins: [LLPIN_FIXTURE.gstin],
          companyStatus: LLPIN_FIXTURE.company_status,
          entityType: 'LLP',
          incorporationDate: LLPIN_FIXTURE.incorporation_date,
          businessCategory: LLPIN_FIXTURE.business_category,
          registeredOffice: LLPIN_FIXTURE.registered_address,
          directors: LLPIN_FIXTURE.directors.map((d) => ({
            din: d.din,
            name: d.name,
            designation: d.designation,
            appointmentDate: d.appointment_date,
          })),
          sourceUrl: LLPIN_FIXTURE.source_url,
          lastFetchedAt: new Date().toISOString(),
          sourceUpdatedAt: LLPIN_FIXTURE.last_updated_at,
          identityMatchMethod: 'EXACT_LLPIN',
          ambiguityNotes: 'Synthetic LLP fixture matched by exact demo identifier; no live registry lookup was performed.',
          isCached: false,
        },
      };
    }

    if (cleanCin === TATA_STEEL_CIN_FIXTURE.cin) {
      return {
        success: true,
        status: 'DEMO_DATA',
        upstreamRequestId: 'mock_req_ind_cin_11',
        isMock: true,
        profile: {
          canonicalName: TATA_STEEL_CIN_FIXTURE.legal_name,
          tradeName: TATA_STEEL_CIN_FIXTURE.trade_name,
          cin: cleanCin,
          llpin: null,
          gstins: [TATA_STEEL_CIN_FIXTURE.gstin],
          pan: TATA_STEEL_CIN_FIXTURE.pan,
          companyStatus: TATA_STEEL_CIN_FIXTURE.company_status,
          entityType: 'COMPANY',
          incorporationDate: TATA_STEEL_CIN_FIXTURE.incorporation_date,
          businessCategory: TATA_STEEL_CIN_FIXTURE.business_category,
          classOfCompany: TATA_STEEL_CIN_FIXTURE.class_of_company,
          registeredOffice: TATA_STEEL_CIN_FIXTURE.registered_address,
          directors: TATA_STEEL_CIN_FIXTURE.directors.map((d) => ({
            din: d.din,
            name: d.name,
            designation: d.designation,
            appointmentDate: d.appointment_date,
          })),
          charges: TATA_STEEL_CIN_FIXTURE.charges.map((c) => ({
            chargeId: c.charge_id,
            holderName: c.holder_name,
            amountInr: c.amount_inr,
            creationDate: c.date_of_creation,
            status: c.status,
          })),
          sourceUrl: TATA_STEEL_CIN_FIXTURE.source_url,
          lastFetchedAt: new Date().toISOString(),
          sourceUpdatedAt: TATA_STEEL_CIN_FIXTURE.last_updated_at,
          identityMatchMethod: 'EXACT_CIN',
          ambiguityNotes: 'Synthetic test fixture for the known demo CIN; no live MCA21 lookup was performed.',
          isCached: false,
        },
      };
    }

    return {
      success: true,
      status: 'DEMO_DATA',
      upstreamRequestId: 'mock_req_unknown_cin',
      isMock: true,
      profile: {
        canonicalName: `Unverified synthetic entity (${cleanCin})`,
        tradeName: null,
        cin: cleanCin,
        llpin: null,
        gstins: [],
        companyStatus: 'UNKNOWN',
        entityType: 'OTHER',
        registeredOffice: null,
        directors: [],
        charges: [],
        sourceUrl: 'https://unresolved-fixture.vendortrace.invalid/identifier',
        lastFetchedAt: new Date().toISOString(),
        identityMatchMethod: 'NAME_MATCH',
        ambiguityNotes: 'No matching synthetic fixture exists for this identifier. This is an unresolved placeholder, not a registry result or identity verification.',
        isCached: false,
      },
    };
  }

  public async lookupByGSTIN(gstin: string): Promise<CompanyRegistryLookupResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        message: 'INDIACOS_API_KEY is not configured.',
        isMock: true,
      };
    }

    const cleanGstin = gstin.trim().toUpperCase();

    if (cleanGstin === PROPRIETORSHIP_GSTIN_FIXTURE.gstin) {
      return {
        success: true,
        status: 'DEMO_DATA',
        upstreamRequestId: 'mock_req_gst_prop_12',
        isMock: true,
        profile: {
          canonicalName: PROPRIETORSHIP_GSTIN_FIXTURE.legal_name,
          tradeName: PROPRIETORSHIP_GSTIN_FIXTURE.trade_name,
          cin: null,
          llpin: null,
          gstins: [cleanGstin],
          pan: PROPRIETORSHIP_GSTIN_FIXTURE.pan,
          companyStatus: PROPRIETORSHIP_GSTIN_FIXTURE.company_status,
          entityType: 'PROPRIETORSHIP',
          incorporationDate: PROPRIETORSHIP_GSTIN_FIXTURE.registration_date,
          businessCategory: PROPRIETORSHIP_GSTIN_FIXTURE.constitution_of_business,
          registeredOffice: PROPRIETORSHIP_GSTIN_FIXTURE.principal_place_address,
          sourceUrl: PROPRIETORSHIP_GSTIN_FIXTURE.source_url,
          lastFetchedAt: new Date().toISOString(),
          sourceUpdatedAt: PROPRIETORSHIP_GSTIN_FIXTURE.last_updated_at,
          identityMatchMethod: 'EXACT_GSTIN',
          ambiguityNotes: 'Synthetic proprietorship fixture matched by exact demo GSTIN; no live GSTN lookup was performed.',
          isCached: false,
        },
      };
    }

    if (cleanGstin === TATA_STEEL_CIN_FIXTURE.gstin) {
      return {
        success: true,
        status: 'DEMO_DATA',
        upstreamRequestId: 'mock_req_ind_gst_22',
        isMock: true,
        profile: {
          canonicalName: TATA_STEEL_CIN_FIXTURE.legal_name,
          tradeName: TATA_STEEL_CIN_FIXTURE.trade_name,
          cin: TATA_STEEL_CIN_FIXTURE.cin,
          llpin: null,
          gstins: [cleanGstin],
          pan: TATA_STEEL_CIN_FIXTURE.pan,
          companyStatus: TATA_STEEL_CIN_FIXTURE.company_status,
          entityType: 'COMPANY',
          incorporationDate: TATA_STEEL_CIN_FIXTURE.incorporation_date,
          businessCategory: TATA_STEEL_CIN_FIXTURE.business_category,
          registeredOffice: TATA_STEEL_CIN_FIXTURE.registered_address,
          sourceUrl: 'https://gst-fixture.vendortrace.invalid/taxpayer/demo-record',
          lastFetchedAt: new Date().toISOString(),
          sourceUpdatedAt: TATA_STEEL_CIN_FIXTURE.last_updated_at,
          identityMatchMethod: 'EXACT_GSTIN',
          ambiguityNotes: 'Synthetic test fixture for the known demo GSTIN; no live GSTN lookup was performed.',
          isCached: false,
        },
      };
    }

    return {
      success: true,
      status: 'DEMO_DATA',
      upstreamRequestId: 'mock_req_unknown_gstin',
      isMock: true,
      profile: {
        canonicalName: `Unverified synthetic tax entity (${cleanGstin})`,
        tradeName: null,
        cin: null,
        llpin: null,
        gstins: [cleanGstin],
        companyStatus: 'UNKNOWN',
        entityType: 'OTHER',
        registeredOffice: null,
        sourceUrl: 'https://unresolved-gstin-fixture.vendortrace.invalid/taxpayer',
        lastFetchedAt: new Date().toISOString(),
        identityMatchMethod: 'NAME_MATCH',
        ambiguityNotes: 'No matching synthetic fixture exists for this GSTIN. This is an unresolved placeholder, not a registry result or identity verification.',
        isCached: false,
      },
    };
  }

  public async lookupByDIN(din: string): Promise<CompanyRegistryLookupResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        message: 'INDIACOS_API_KEY is not configured.',
        isMock: true,
      };
    }

    return {
      success: true,
      status: 'DEMO_DATA',
      upstreamRequestId: 'mock_req_ind_din_33',
      isMock: true,
      profile: {
        canonicalName: 'Synthetic Director Fixture',
        gstins: [],
        companyStatus: 'UNKNOWN',
        entityType: 'OTHER',
        directors: [{ din, name: 'Fictional Demo Director' }],
        sourceUrl: `https://director-fixture.vendortrace.invalid/director/${encodeURIComponent(din)}`,
        ambiguityNotes: 'Offline synthetic director fixture only; no live director registry was queried.',
        lastFetchedAt: new Date().toISOString(),
        identityMatchMethod: 'CONFIRMED_SELECTION',
        isCached: false,
      },
    };
  }

  public async searchCandidates(query: string): Promise<{ candidates: CandidateEntity[]; upstreamRequestId?: string | null }> {
    const q = (query || '').toLowerCase().trim();

    if (q.includes('apex') || q.includes('infra')) {
      return {
        candidates: MULTI_CANDIDATE_SEARCH_FIXTURE,
        upstreamRequestId: 'mock_req_find_apex_01',
      };
    }

    if (q.includes('tata')) {
      return {
        candidates: [
          {
            id: 'cand_tata_fixture',
            canonicalName: TATA_STEEL_CIN_FIXTURE.legal_name,
            tradeName: TATA_STEEL_CIN_FIXTURE.trade_name,
            identifierType: 'CIN',
            identifierValue: TATA_STEEL_CIN_FIXTURE.cin,
            companyStatus: TATA_STEEL_CIN_FIXTURE.company_status,
            entityType: 'COMPANY',
            registeredAddress: TATA_STEEL_CIN_FIXTURE.registered_address,
            state: 'Maharashtra',
            sourceUrl: TATA_STEEL_CIN_FIXTURE.source_url,
            identityMatchMethod: 'NAME_MATCH',
            ambiguityNote: 'Synthetic Tata Steel fixture for deterministic demo use; this is not a live name search.',
          },
        ],
        upstreamRequestId: 'mock_req_find_tata_02',
      };
    }

    // Unknown names must not be mapped to an unrelated predefined company.
    return { candidates: [], upstreamRequestId: 'mock_req_no_fixture_match' };
  }
}

export class MockWebInvestigationProvider implements WebInvestigationProvider {
  public readonly id = 'tinyfish' as const;
  public readonly name = 'TinyFish Web Agent & Adverse Media (Mock Adapter)';
  private isKeySet = true;
  private config: MockSimulationConfig = {};

  constructor(isConfigured = true, config: MockSimulationConfig = {}) {
    this.isKeySet = isConfigured;
    this.config = config;
  }

  public setConfig(config: MockSimulationConfig) {
    this.config = config;
  }

  public setConfigured(isConfigured: boolean) {
    this.isKeySet = isConfigured;
  }

  public isConfigured(): boolean {
    return this.isKeySet;
  }

  public async testConnection(): Promise<ProviderTestResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        errorCategory: null,
        latencyMs: 0,
        message: 'TINYFISH_API_KEY is missing from server environment secrets.',
        isMock: true,
      };
    }

    if (this.config.simulateTimeout) {
      return {
        success: false,
        status: 'UPSTREAM_UNAVAILABLE',
        errorCategory: 'TIMEOUT',
        latencyMs: 7000,
        message: 'Request timed out after 7000ms. Upstream service took too long to respond.',
        isMock: true,
      };
    }

    if (this.config.forceStatus && this.config.forceStatus !== 'LIVE' && this.config.forceStatus !== 'DEMO_DATA') {
      return {
        success: false,
        status: this.config.forceStatus,
        errorCategory: this.config.forceErrorCategory || 'NETWORK',
        latencyMs: this.config.forceLatencyMs || 110,
        message: this.config.forceErrorMessage || `Simulated ${this.config.forceStatus} error`,
        isMock: true,
      };
    }

    return {
      success: true,
      status: 'DEMO_DATA',
      errorCategory: null,
      upstreamRequestId: 'mock_req_tf_4455',
      latencyMs: this.config.forceLatencyMs || 60,
      message: 'Mock connection successful. Returning synthetic media signals.',
      isMock: true,
    };
  }

  public async searchAdverseMedia(
    entityName: string,
    options: { limit?: number } = {}
  ): Promise<WebInvestigationSearchResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        message: 'TINYFISH_API_KEY is not configured.',
        isMock: true,
      };
    }

    if (this.config.forceStatus && this.config.forceStatus !== 'LIVE' && this.config.forceStatus !== 'DEMO_DATA') {
      return {
        success: false,
        status: this.config.forceStatus,
        errorCategory: this.config.forceErrorCategory || 'NETWORK',
        message: this.config.forceErrorMessage || `Simulated ${this.config.forceStatus} error`,
        isMock: true,
      };
    }

    return {
      success: true,
      status: 'DEMO_DATA',
      upstreamRequestId: 'mock_req_tf_search_99',
      isMock: true,
      articles: [
        {
          title: `[Synthetic Demo] ${entityName} corporate-compliance example`,
          url: 'https://media-fixture.vendortrace.invalid/sample/report',
          snippet: 'SYNTHETIC DEMO ONLY: Fictional routine disclosure example. No live media source was queried.',
          sourceDomain: 'media-fixture.vendortrace.invalid',
          publishedDate: undefined,
        },
      ],
    };
  }
}
