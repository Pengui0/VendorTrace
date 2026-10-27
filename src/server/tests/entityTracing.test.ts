/**
 * Layer 2 Related-Entity Tracing Test Suite
 * Tests shared address, same-name directors, exact DIN match, duplicate companies,
 * no anchors, and depth/count limits.
 */

import { entityTracingService, TRACING_DISCLAIMER } from '../services/entityTracingService.js';

export async function runEntityTracingTests(): Promise<{
  success: boolean;
  assertionsPassed: number;
  assertionsFailed: number;
  logs: string[];
}> {
  const logs: string[] = [];
  let assertionsPassed = 0;
  let assertionsFailed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      assertionsPassed++;
      logs.push(`[PASS] ${desc}`);
    } else {
      assertionsFailed++;
      logs.push(`[FAIL] ${desc}`);
    }
  }

  const baseVendor = {
    canonicalName: 'SYNTHETIC TEST SUPPLIER LIMITED',
    cin: 'U99999XX2024PTC999999',
    gstin: '99AAAAA9999A1Z5',
    profile: {
      canonicalName: 'SYNTHETIC TEST SUPPLIER LIMITED',
      cin: 'U99999XX2024PTC999999',
      gstins: ['99AAAAA9999A1Z5'],
      companyStatus: 'ACTIVE',
      entityType: 'COMPANY' as const,
      registeredOffice: '99 Fictional Demo Avenue, Test City, XX 000000',
      directors: [
        { din: '99999999', name: 'Aarav Patel (Fictional Director)', designation: 'Director' },
      ],
      identityMatchMethod: 'EXACT_CIN' as const,
      isCached: false,
      lastFetchedAt: new Date().toISOString(),
    },
  };

  logs.push('=== 1. TESTING ANCHOR EXTRACTION ===');
  const anchors = entityTracingService.extractAnchors(baseVendor);
  assert(anchors.some((a) => a.type === 'CIN'), 'Extracts canonical CIN anchor');
  assert(anchors.some((a) => a.type === 'GSTIN'), 'Extracts registered GSTIN anchor');
  assert(anchors.some((a) => a.type === 'DIN'), 'Extracts director 8-digit DIN anchor');
  assert(anchors.some((a) => a.type === 'REGISTERED_ADDRESS'), 'Extracts registered office address anchor');

  logs.push('\n=== 2. TESTING EXACT DIN MATCH (STRONG IDENTIFIER) ===');
  const dinReport = await entityTracingService.traceRelatedEntities(baseVendor, [], {
    useMock: true,
    mockScenario: 'EXACT_DIN',
  });

  assert(dinReport.relationships.length > 0, 'Discovers related companies sharing director DIN');
  const dinRel = dinReport.relationships[0];
  assert(dinRel.strength === 'strong_identifier', 'Exact DIN match is classified as strong_identifier');
  assert(dinRel.matchMethod === 'EXACT_DIN', 'Match method explicitly recorded as EXACT_DIN');
  assert(dinRel.sourceUrls.every((url) => new URL(url).hostname.endsWith('.invalid')), 'Mock relationship evidence links use reserved synthetic domains');
  assert(Boolean(dinRel.targetCin), 'Target relationship includes a synthetic CIN-shaped identifier for the demo fixture');
  assert(dinRel.lightweightL1Status === 'UNKNOWN', 'Does not claim a related company was risk-scanned when only a relationship fixture was generated');
  assert(dinRel.leadDisclaimer.includes('Discovery lead'), 'Attaches zero-guilt-by-association disclaimer');

  logs.push('\n=== 3. TESTING SAME-NAME DIRECTORS WITHOUT DIN (NEVER MERGED) ===');
  const sameNameReport = await entityTracingService.traceRelatedEntities(baseVendor, [], {
    useMock: true,
    mockScenario: 'SAME_NAME_NO_DIN',
  });

  assert(sameNameReport.relationships.length === 1, 'Records single candidate match');
  const sameNameRel = sameNameReport.relationships[0];
  assert(sameNameRel.strength === 'same_name_candidate', 'Same name without DIN is strictly labeled same_name_candidate');
  assert(Boolean(sameNameRel.details.notes?.includes('No matching 8-digit')), 'Notes lack of confirmed DIN (never merged)');
  assert(sameNameRel.leadDisclaimer.includes('Unverified name match'), 'Warns against conflating individuals with common Indian names');

  logs.push('\n=== 4. TESTING SHARED REGISTERED ADDRESS ===');
  const addrReport = await entityTracingService.traceRelatedEntities(baseVendor, [], {
    useMock: true,
    mockScenario: 'SHARED_ADDRESS',
  });

  assert(addrReport.relationships.length > 0, 'Discovers co-located company');
  const addrRel = addrReport.relationships[0];
  assert(addrRel.strength === 'same_address_candidate', 'Classified strictly as same_address_candidate');
  assert(addrRel.relationshipType === 'SHARED_ADDRESS', 'Relationship type is SHARED_ADDRESS');
  assert(
    addrRel.leadDisclaimer.includes('Shared directors or registered offices') ||
    addrRel.leadDisclaimer.includes('proof of control'),
    'Zero-guilt rule: Shared address is never presented as proof of control or fraud'
  );

  logs.push('\n=== 5. TESTING DUPLICATE COMPANY DEDUPLICATION ===');
  const dupReport = await entityTracingService.traceRelatedEntities(baseVendor, [], {
    useMock: true,
    mockScenario: 'DUPLICATE_ENTITIES',
  });

  assert(dupReport.relationships.length === 1, 'Deduplicates duplicated related company entries');

  logs.push('\n=== 6. TESTING NO ANCHORS HANDLING ===');
  const noAnchorVendor = { canonicalName: 'UNKNOWN SHELL ENTITY' };
  const noAnchorReport = await entityTracingService.traceRelatedEntities(noAnchorVendor, [], {
    useMock: true,
    mockScenario: 'NO_ANCHORS',
  });

  assert(noAnchorReport.anchors.length === 0, 'Reports 0 anchors');
  assert(noAnchorReport.relationships.length === 0, 'Returns 0 relationships (does not fabricate links)');
  assert(noAnchorReport.graph.nodes.length === 1, 'Graph contains only the primary vendor root node');
  assert(noAnchorReport.graph.edges.length === 0, 'Graph contains 0 edges');

  logs.push('\n=== 7. TESTING DEPTH & COUNT LIMITS ===');
  const limitReport = await entityTracingService.traceRelatedEntities(baseVendor, [], {
    useMock: true,
    mockScenario: 'LIMIT_EXCEEDED',
    maxCandidatesPerAnchor: 5,
    maxDepth: 3, // Requesting depth 3 should be clamped to 1
  });

  assert(limitReport.relationships.length === 5, 'Clamps candidate count to configured limit (5)');
  assert(limitReport.graph.stats.depth === 1, 'Clamps traversal depth to maximum 1 for MVP safety');
  assert(limitReport.graph.disclaimer === TRACING_DISCLAIMER, 'Graph root bears mandatory compliance disclaimer');

  return {
    success: assertionsFailed === 0,
    assertionsPassed,
    assertionsFailed,
    logs,
  };
}
