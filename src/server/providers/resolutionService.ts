/**
 * IndiaCos Vendor Resolution Service
 * Handles format detection (CIN/LLPIN/GSTIN), Candidate Disambiguation,
 * Documented 24h Registry Caching, and Canonical Entity Mapping.
 */

import { indiacos } from './indiacos.js';
import { integrationManager } from './integrationManager.js';
import { detectIdentifierKind, IdentifierDetectionResult } from './identifierDetector.js';
import {
  ResolvedCompanyProfile,
  CandidateEntity,
  CompanyRegistryLookupResult,
} from './types.js';
import { registryCache } from './cache.js';

export interface ResolveVendorRequest {
  query: string;
  useMock?: boolean;
  selectedCandidate?: CandidateEntity;
  websiteUrl?: string;
}

export interface ResolveVendorResponse {
  success: boolean;
  detection: IdentifierDetectionResult;
  requiresDisambiguation: boolean;
  candidates?: CandidateEntity[];
  profile?: ResolvedCompanyProfile;
  message: string;
  isCached: boolean;
  upstreamRequestId?: string | null;
  status: string;
  isMock: boolean;
}

export class ResolutionService {
  public async resolveVendor(req: ResolveVendorRequest): Promise<ResolveVendorResponse> {
    const rawQuery = (req.query || '').trim();
    const useMock = Boolean(req.useMock);

    // Normal Resolution Flow: Step 1: Detect format
    const detection = detectIdentifierKind(rawQuery);

    // If user confirmed a specific candidate from disambiguation:
    if (req.selectedCandidate) {
      const cand = req.selectedCandidate;
      const provider = useMock ? integrationManager.getMockIndiacos() : indiacos;
      let lookupResult: CompanyRegistryLookupResult;

      if (cand.identifierType === 'CIN' || cand.identifierType === 'LLPIN') {
        lookupResult = await provider.lookupByCIN(cand.identifierValue);
      } else if (cand.identifierType === 'GSTIN') {
        lookupResult = await provider.lookupByGSTIN(cand.identifierValue);
      } else {
        lookupResult = await provider.lookupByCIN(cand.identifierValue);
      }

      const profile = lookupResult.profile;
      if (profile) {
        // The candidate itself is the selected synthetic/demo result. Do not
        // leave canonical fields inherited from a different fixture identifier.
        if (useMock) {
          profile.canonicalName = cand.canonicalName;
          profile.tradeName = cand.tradeName || null;
          profile.companyStatus = cand.companyStatus || 'UNKNOWN';
          profile.entityType = cand.entityType;
          profile.registeredOffice = cand.registeredAddress || null;
          profile.sourceUrl = cand.sourceUrl || 'https://candidate-fixture.vendortrace.invalid/selected';
          profile.cin = cand.identifierType === 'CIN' ? cand.identifierValue : null;
          profile.llpin = cand.identifierType === 'LLPIN' ? cand.identifierValue : null;
          profile.gstins = cand.identifierType === 'GSTIN' ? [cand.identifierValue] : [];
          profile.ambiguityNotes = `Synthetic demo candidate selected by the user for query "${rawQuery}". Selection is not a live registry verification.`;
        } else {
          profile.ambiguityNotes = `Candidate selected by the user for query "${rawQuery}". Provider verification and evidence still determine confidence.`;
        }
        profile.identityMatchMethod = 'CONFIRMED_SELECTION';
        const cacheNamespace = useMock ? 'indiacos:demo' : 'indiacos:live';
        const keyType = cand.identifierType === 'GSTIN' ? 'gst' : 'cin';
        registryCache.set(`${cacheNamespace}:${keyType}:${cand.identifierValue}`, profile);
        registryCache.set(`${cacheNamespace}:canonical:${cand.identifierValue}`, profile);
      }

      return {
        success: lookupResult.success,
        detection: {
          kind: cand.identifierType as any,
          rawInput: rawQuery,
          normalizedValue: cand.identifierValue,
          isValid: true,
          helperMessage: `Resolved via selected candidate: ${cand.canonicalName}`,
        },
        requiresDisambiguation: false,
        profile,
        message: lookupResult.message || `Successfully resolved ${cand.canonicalName}`,
        isCached: profile?.isCached || false,
        upstreamRequestId: lookupResult.upstreamRequestId,
        status: lookupResult.status,
        isMock: lookupResult.isMock,
      };
    }

    // Step 2: Check 24-hour low-volatility registry cache first
    if (detection.kind === 'CIN' || detection.kind === 'LLPIN') {
      const cacheKey = `indiacos:${useMock ? 'demo' : 'live'}:cin:${detection.normalizedValue}`;
      const cached = registryCache.get<ResolvedCompanyProfile>(cacheKey);

      if (cached) {
        return {
          success: true,
          detection,
          requiresDisambiguation: false,
          profile: { ...cached.data, isCached: true },
          message: `Served from 24h low-volatility registry cache for ${detection.kind}: ${detection.normalizedValue}`,
          isCached: true,
          status: useMock ? 'DEMO_DATA' : 'LIVE',
          isMock: useMock,
        };
      }
    } else if (detection.kind === 'GSTIN') {
      const cacheKey = `indiacos:${useMock ? 'demo' : 'live'}:gst:${detection.normalizedValue}`;
      const cached = registryCache.get<ResolvedCompanyProfile>(cacheKey);

      if (cached) {
        return {
          success: true,
          detection,
          requiresDisambiguation: false,
          profile: { ...cached.data, isCached: true },
          message: `Served from 24h low-volatility registry cache for GSTIN: ${detection.normalizedValue}`,
          isCached: true,
          status: useMock ? 'DEMO_DATA' : 'LIVE',
          isMock: useMock,
        };
      }
    }

    // Strict Anti-Fabrication Rule: In live mode, if not in cache and credentials missing, cleanly fail
    if (!useMock && !indiacos.isConfigured()) {
      return {
        success: false,
        detection,
        requiresDisambiguation: false,
        message: 'INDIACOS_API_KEY is not configured in server secrets. Real-time lookup requires configuring credentials. No mock data is returned in live mode.',
        isCached: false,
        status: 'NOT_CONFIGURED',
        isMock: false,
      };
    }

    const provider = useMock ? integrationManager.getMockIndiacos() : indiacos;

    // Step 3A: Direct CIN or LLPIN Lookup
    if (detection.kind === 'CIN' || detection.kind === 'LLPIN') {
      const cacheKey = `indiacos:${useMock ? 'demo' : 'live'}:cin:${detection.normalizedValue}`;
      const result = await provider.lookupByCIN(detection.normalizedValue);

      if (result.success && result.profile) {
        registryCache.set(cacheKey, result.profile);
      }

      return {
        success: result.success,
        detection,
        requiresDisambiguation: false,
        profile: result.profile,
        message: result.message || `Successfully resolved company by ${detection.kind}: ${detection.normalizedValue}`,
        isCached: false,
        upstreamRequestId: result.upstreamRequestId,
        status: result.status,
        isMock: result.isMock,
      };
    }

    // Step 3B: Direct GSTIN Lookup (Handles proprietorships & companies)
    if (detection.kind === 'GSTIN') {
      const cacheKey = `indiacos:${useMock ? 'demo' : 'live'}:gst:${detection.normalizedValue}`;
      const result = await provider.lookupByGSTIN(detection.normalizedValue);

      if (result.success && result.profile) {
        registryCache.set(cacheKey, result.profile);
      }

      return {
        success: result.success,
        detection,
        requiresDisambiguation: false,
        profile: result.profile,
        message: result.message || `Successfully resolved tax entity by GSTIN: ${detection.normalizedValue}`,
        isCached: false,
        upstreamRequestId: result.upstreamRequestId,
        status: result.status,
        isMock: result.isMock,
      };
    }

    // Step 3C: Company Name Search & Multi-Candidate Disambiguation
    const searchRes = await provider.searchCandidates(rawQuery);
    const candidates = searchRes.candidates || [];

    // If zero matches:
    if (candidates.length === 0) {
      return {
        success: false,
        detection,
        requiresDisambiguation: false,
        candidates: [],
        message: `No corporate entities found registered under "${rawQuery}". Please check spelling or search by 21-digit CIN / 15-digit GSTIN.`,
        isCached: false,
        upstreamRequestId: searchRes.upstreamRequestId,
        status: useMock ? 'DEMO_DATA' : provider.isConfigured() ? 'LIVE' : 'NOT_CONFIGURED',
        isMock: useMock,
      };
    }

    // If multiple candidates match: DO NOT silently choose! Require user disambiguation
    if (candidates.length > 1) {
      return {
        success: true,
        detection,
        requiresDisambiguation: true,
        candidates,
        message: `Found ${candidates.length} candidate entities matching "${rawQuery}". Manual officer selection required.`,
        isCached: false,
        upstreamRequestId: searchRes.upstreamRequestId,
        status: useMock ? 'DEMO_DATA' : 'LIVE',
        isMock: useMock,
      };
    }

    // Exactly 1 match found: resolve that entity's canonical record
    const single = candidates[0];
    const singleLookup =
      single.identifierType === 'GSTIN'
        ? await provider.lookupByGSTIN(single.identifierValue)
        : await provider.lookupByCIN(single.identifierValue);

    if (singleLookup.success && singleLookup.profile) {
      const key = single.identifierType === 'GSTIN' ? `indiacos:${useMock ? 'demo' : 'live'}:gst:${single.identifierValue}` : `indiacos:${useMock ? 'demo' : 'live'}:cin:${single.identifierValue}`;
      registryCache.set(key, singleLookup.profile);
    }

    return {
      success: singleLookup.success,
      detection,
      requiresDisambiguation: false,
      candidates,
      profile: singleLookup.profile,
      message: singleLookup.message || `Identified single matching registered entity: ${single.canonicalName}`,
      isCached: singleLookup.profile?.isCached || false,
      upstreamRequestId: singleLookup.upstreamRequestId,
      status: singleLookup.status,
      isMock: singleLookup.isMock,
    };
  }
}

export const resolutionService = new ResolutionService();
