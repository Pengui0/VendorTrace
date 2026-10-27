/**
 * Automated Verification Unit Tests for IndiaCos Vendor Resolution
 * Tests: Identifier format validation, CIN/LLPIN lookup, Proprietor GSTIN lookup (no CIN),
 * Multi-candidate disambiguation, and 24-hour Low-Volatility Caching.
 */

import { detectIdentifierKind } from '../providers/identifierDetector.js';
import { resolutionService } from '../providers/resolutionService.js';
import { registryCache } from '../providers/cache.js';

export interface ResolutionTestReport {
  success: boolean;
  timestamp: string;
  assertionsPassed: number;
  assertionsFailed: number;
  details: string[];
  error?: string;
}

export async function runIndiacosResolutionTests(): Promise<ResolutionTestReport> {
  const details: string[] = [];
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, desc: string) => {
    if (condition) {
      passed++;
      details.push(`[PASS] ${desc}`);
    } else {
      failed++;
      details.push(`[FAIL] ${desc}`);
      throw new Error(`Assertion failed: ${desc}`);
    }
  };

  try {
    details.push('Initiating IndiaCos Vendor Resolution Unit Tests...');
    registryCache.clear();

    // ==========================================
    // 1. IDENTIFIER FORMAT DETECTION
    // ==========================================
    const cinDetect = detectIdentifierKind('L27100MH1907PLC000260');
    assert(cinDetect.kind === 'CIN' && cinDetect.isValid, '21-digit CIN correctly detected and validated');

    const llpinDetect = detectIdentifierKind('AAA-1234');
    assert(llpinDetect.kind === 'LLPIN' && llpinDetect.isValid, 'LLPIN with hyphen correctly detected and validated');

    const gstinDetect = detectIdentifierKind('07AAAAA0000A1Z5');
    assert(gstinDetect.kind === 'GSTIN' && gstinDetect.isValid, '15-character GSTIN correctly detected and validated');

    const nameDetect = detectIdentifierKind('Apex Infra Projects Private Limited');
    assert(nameDetect.kind === 'COMPANY_NAME', 'Prose input correctly identified as COMPANY_NAME');

    // ==========================================
    // 2. DIRECT CIN RESOLUTION (FIXTURE RESPONSE)
    // ==========================================
    const cinResolution = await resolutionService.resolveVendor({
      query: 'L27100MH1907PLC000260',
      useMock: true,
    });
    assert(cinResolution.success === true, 'CIN resolution returned success = true');
    assert(cinResolution.requiresDisambiguation === false, 'Direct CIN does not require disambiguation');
    assert(cinResolution.profile?.canonicalName === 'TATA STEEL LIMITED', 'Resolved canonical company name matches');
    assert(cinResolution.profile?.cin === 'L27100MH1907PLC000260', 'Resolved CIN preserved in profile');
    assert(cinResolution.profile?.incorporationDate === '1907-08-26', 'Incorporation date correctly populated');
    assert(cinResolution.profile?.directors?.length === 2, 'Directors list extracted from synthetic fixture');
    assert(cinResolution.profile?.charges?.length === 2, 'Charges & filings list extracted from synthetic fixture');
    assert(cinResolution.profile?.sourceUpdatedAt !== undefined, 'Synthetic fixture timestamp captured');
    assert(cinResolution.profile?.sourceUrl?.includes('.invalid') === true, 'Demo CIN record points only to reserved .invalid fixture URLs');

    // ==========================================
    // 3. PROPRIETORSHIP GSTIN RESOLUTION (NO CIN EXISTS)
    // ==========================================
    const propResolution = await resolutionService.resolveVendor({
      query: '07AAAAA0000A1Z5',
      useMock: true,
    });
    assert(propResolution.success === true, 'Proprietor GSTIN resolution returned success = true');
    assert(propResolution.profile?.entityType === 'PROPRIETORSHIP', 'Entity accurately classified as PROPRIETORSHIP');
    assert(propResolution.profile?.cin === null, 'Proprietorship strictly has cin = null (does not invent false CIN)');
    assert(Boolean(propResolution.profile?.gstins.includes('07AAAAA0000A1Z5')), 'GSTIN recorded as canonical tax key');
    assert(propResolution.profile?.tradeName === 'SHARMA INDUSTRIAL FASTENERS', 'Trade name preserved');
    assert(propResolution.profile?.sourceUrl?.includes('.invalid') === true, 'Demo GSTIN record points only to reserved .invalid fixture URLs');

    // ==========================================
    // 4. LLPIN RESOLUTION
    // ==========================================
    const llpResolution = await resolutionService.resolveVendor({
      query: 'AAA-1234',
      useMock: true,
    });
    assert(llpResolution.profile?.entityType === 'LLP', 'Entity accurately classified as LLP');
    assert(llpResolution.profile?.llpin === 'AAA1234' || llpResolution.profile?.llpin === 'AAA-1234', 'LLPIN normalized');

    // ==========================================
    // 5. CANDIDATE SEARCH & MANDATORY DISAMBIGUATION
    // ==========================================
    const searchRes = await resolutionService.resolveVendor({
      query: 'Apex Infra',
      useMock: true,
    });
    assert(searchRes.requiresDisambiguation === true, 'Multi-match search requiresDisambiguation = true');
    assert(searchRes.candidates !== undefined && searchRes.candidates.length === 3, 'Found 3 distinct candidate entities');
    assert(searchRes.candidates![0].state === 'Maharashtra', 'Candidate 1 located in Maharashtra');
    assert(searchRes.candidates![1].companyStatus === 'STRIKE_OFF', 'Candidate 2 status is STRIKE_OFF');
    assert(searchRes.candidates![2].entityType === 'LLP', 'Candidate 3 is an LLP');

    // Confirm that manual candidate selection resolves selected entity:
    const chosenCandidate = searchRes.candidates![0];
    const confirmedRes = await resolutionService.resolveVendor({
      query: 'Apex Infra',
      selectedCandidate: chosenCandidate,
      useMock: true,
    });
    assert(confirmedRes.requiresDisambiguation === false, 'Confirmed candidate eliminates ambiguity');
    assert(confirmedRes.profile?.identityMatchMethod === 'CONFIRMED_SELECTION', 'Identity match marked as CONFIRMED_SELECTION');
    assert(confirmedRes.profile?.canonicalName === chosenCandidate.canonicalName, 'Selected candidate canonical name matches the candidate card');
    assert(confirmedRes.profile?.companyStatus === chosenCandidate.companyStatus, 'Selected candidate status matches its synthetic candidate card');
    assert(confirmedRes.profile?.ambiguityNotes?.includes('not a live registry verification') === true, 'Selected demo candidate remains explicitly synthetic');


    // Arbitrary inputs must not be silently mapped to known fixtures.
    const unknownCinRes = await resolutionService.resolveVendor({
      query: 'U12345KA2020PTC123456',
      useMock: true,
    });
    assert(unknownCinRes.success === true, 'Unknown demo CIN yields an explicit placeholder result rather than a crash');
    assert(unknownCinRes.profile?.companyStatus === 'UNKNOWN', 'Unknown demo CIN is not represented as active or verified');
    assert(unknownCinRes.profile?.canonicalName.includes('Unverified synthetic entity') === true, 'Unknown demo CIN is not mapped to Tata Steel or another known company');

    const unknownGstinRes = await resolutionService.resolveVendor({
      query: '29ABCDE1234F1Z5',
      useMock: true,
    });
    assert(unknownGstinRes.profile?.companyStatus === 'UNKNOWN', 'Unknown demo GSTIN remains UNKNOWN');
    assert(unknownGstinRes.profile?.entityType === 'OTHER', 'Unknown demo GSTIN does not guess entity constitution');

    const unknownNameRes = await resolutionService.resolveVendor({
      query: 'Some Completely Unlisted Industries Private Limited',
      useMock: true,
    });
    assert(unknownNameRes.success === false && (unknownNameRes.candidates || []).length === 0, 'Unknown demo company name is not falsely matched to Tata Steel');

    // ==========================================
    // 6. LOW-VOLATILITY CACHE VERIFICATION (24H TTL)
    // ==========================================
    const cacheStatsBefore = registryCache.getStats();
    assert(cacheStatsBefore.hits === 0, 'Cache starts with 0 hits');

    // Re-query identical CIN in demo mode: demo cache should serve demo data.
    const cachedCinRes = await resolutionService.resolveVendor({
      query: 'L27100MH1907PLC000260',
      useMock: true,
    });
    const cacheStatsAfter = registryCache.getStats();
    assert(cachedCinRes.isCached === true, 'Second query for CIN is served from the demo-scoped 24h cache');
    assert(cachedCinRes.status === 'DEMO_DATA' && cachedCinRes.isMock === true, 'Cached demo fixture remains labeled demo data');
    assert(cacheStatsAfter.hits >= 1, 'Cache hit registered');

    // A demo cache entry must never be reused for live mode.
    registryCache.clear();
    const liveWithoutCredentials = await resolutionService.resolveVendor({
      query: 'L27100MH1907PLC000260',
      useMock: false,
    });
    assert(liveWithoutCredentials.success === false, 'Live lookup does not reuse a synthetic demo cache entry');
    assert(liveWithoutCredentials.status === 'NOT_CONFIGURED', 'Live lookup reports missing credentials instead of returning demo cache data');

    details.push('All IndiaCos vendor resolution tests passed, including demo/live cache isolation.');

    return {
      success: true,
      timestamp: new Date().toISOString(),
      assertionsPassed: passed,
      assertionsFailed: failed,
      details,
    };
  } catch (err: any) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      assertionsPassed: passed,
      assertionsFailed: failed + 1,
      details,
      error: err.message || String(err),
    };
  }
}
