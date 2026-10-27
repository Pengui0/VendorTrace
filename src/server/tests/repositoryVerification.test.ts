/**
 * Automated Verification Test for VendorTrace Repository Persistence
 * Executes comprehensive Create, Read, Update, and Delete (CRUD) assertions.
 */

import { DevInMemoryUnitOfWork } from '../repositories/devInMemoryAdapter.js';
import { validateVendor } from '../validation/domainValidators.js';

export interface VerificationReport {
  success: boolean;
  timestamp: string;
  storageMode: string;
  isDurable: boolean;
  assertionsPassed: number;
  assertionsFailed: number;
  details: string[];
  error?: string;
}

export async function runRepositoryVerification(): Promise<VerificationReport> {
  const uow = new DevInMemoryUnitOfWork();
  const details: string[] = [];
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, description: string) => {
    if (condition) {
      passed++;
      details.push(`[PASS] ${description}`);
    } else {
      failed++;
      details.push(`[FAIL] ${description}`);
      throw new Error(`Assertion failed: ${description}`);
    }
  };

  try {
    details.push(`Initiating persistence verification on adapter: ${uow.getStorageMode().activeAdapterName}`);

    // ==========================================
    // 1. VENDOR CRUD VERIFICATION
    // ==========================================
    // CREATE
    const initialVendor = await uow.vendors.save(
      validateVendor({
        canonicalName: 'SYNTHETIC_TEST_ENTERPRISE_PVT_LTD',
        cin: 'U72200MH2021PTC369123',
        gstins: ['27AAACS1234F1Z8'],
        pan: 'AAACS1234F',
        companyStatus: 'ACTIVE',
        registeredAddress: 'Unit 402, Trade Tower, Bandra Kurla Complex, Mumbai 400051',
        sourceReference: 'Test Suite Suite-Runner',
        latestRiskStatus: 'UNKNOWN',
      })
    );
    assert(Boolean(initialVendor.id), 'Vendor created with stable ID');
    assert(initialVendor.id.startsWith('ven_'), 'Vendor ID has proper "ven_" prefix');

    // READ BY ID
    const readVendor = await uow.vendors.findById(initialVendor.id);
    assert(readVendor !== null, 'Vendor read by ID returned valid record');
    assert(readVendor?.canonicalName === 'SYNTHETIC_TEST_ENTERPRISE_PVT_LTD', 'Vendor canonicalName matches');
    assert(readVendor?.cin === 'U72200MH2021PTC369123', 'Vendor CIN normalized and preserved');

    // READ BY CIN & GSTIN
    const byCin = await uow.vendors.findByCIN('U72200MH2021PTC369123');
    assert(byCin?.id === initialVendor.id, 'Vendor successfully located by 21-char CIN');

    const byGstin = await uow.vendors.findByGSTIN('27AAACS1234F1Z8');
    assert(byGstin?.id === initialVendor.id, 'Vendor successfully located by GSTIN');

    // UPDATE
    const updatedVendor = await uow.vendors.update(initialVendor.id, {
      latestRiskStatus: 'CAUTION',
      inputNames: ['SYNTHETIC_TEST_ENTERPRISE_PVT_LTD', 'Synthetic Trade Alias'],
    });
    assert(updatedVendor.latestRiskStatus === 'CAUTION', 'Vendor risk status updated to CAUTION');
    assert(updatedVendor.inputNames.length === 2, 'Vendor inputNames successfully appended');

    // SEARCH & PAGINATION
    const searchRes = await uow.vendors.search('SYNTHETIC', { page: 1, limit: 10 });
    assert(searchRes.total === 1, 'Search query returned 1 total result');
    assert(searchRes.items[0].id === initialVendor.id, 'Search item matches synthetic vendor');

    // ==========================================
    // 2. EVIDENCE & SIGNAL CRUD VERIFICATION
    // ==========================================
    // CREATE EVIDENCE
    const evidence = await uow.evidence.save({
      id: '',
      sourceName: 'MCA21 RoC Filing',
      sourceDomain: 'mca.gov.in',
      sourceUrl: 'https://mca.gov.in/portal/company/U72200MH2021PTC369123',
      quote: 'Active company with registered capital of INR 10,00,000.',
      publishedAt: null,
      capturedAt: new Date().toISOString(),
      underlyingSource: 'RoC Mumbai Master Data',
      sourceType: 'OfficialRegistry',
      identityMatchNotes: 'Exact 21-digit CIN match',
    });
    assert(evidence.id.startsWith('evi_'), 'Evidence created with stable "evi_" ID');

    // READ EVIDENCE
    const readEvidence = await uow.evidence.findById(evidence.id);
    assert(readEvidence !== null && readEvidence.quote.includes('Active company'), 'Evidence quote verified');

    // CREATE INVESTIGATION
    const investigation = await uow.investigations.save({
      id: '',
      vendorId: initialVendor.id,
      requestedIdentifier: {
        type: 'CIN',
        value: 'U72200MH2021PTC369123',
      },
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'COMPLETED',
      providerStatuses: {
        indiacos: { configured: true, status: 'OK', latencyMs: 120 },
      },
      summary: {
        verdict: 'VERIFIED_CLEAR',
        narrative: 'All registries verified without adverse flags.',
        totalSignals: 1,
        corroboratedSignals: 1,
        reviewNeededSignals: 0,
        highSeveritySignals: 0,
      },
      latestReportReference: 'rep_test_ref_01',
    });
    assert(investigation.id.startsWith('inv_'), 'Investigation created with stable "inv_" ID');

    const nameOnlyInvestigation = await uow.investigations.save({
      id: '',
      vendorId: initialVendor.id,
      requestedIdentifier: { type: 'NAME', value: 'Example Industries Limited' },
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'PARTIAL_FAILURE',
      providerStatuses: {},
      summary: {
        verdict: 'UNKNOWN',
        narrative: 'Name-only lookup requires additional source verification.',
        totalSignals: 0,
        corroboratedSignals: 0,
        reviewNeededSignals: 0,
        highSeveritySignals: 0,
      },
      latestReportReference: 'rep_name_only_01',
    });
    assert(nameOnlyInvestigation.requestedIdentifier.type === 'NAME' && nameOnlyInvestigation.requestedIdentifier.value === 'EXAMPLE INDUSTRIES LIMITED', 'Name-only investigation persists a normalized non-empty requested identifier');

    // CREATE SIGNAL
    const signal = await uow.signals.save({
      id: '',
      investigationId: investigation.id,
      vendorId: initialVendor.id,
      dimension: 'REGISTRY_STATUS',
      title: 'Company Active & Filing Compliant',
      neutralSummary: 'Annual returns filed up to FY2025.',
      severity: 1,
      evidenceIds: [evidence.id],
      confidenceStatus: 'CORROBORATED',
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      lifecycleStatus: 'ACTIVE',
      reviewNote: null,
    });
    assert(signal.id.startsWith('sig_'), 'Signal created with stable "sig_" ID');

    // UPDATE SIGNAL
    const updatedSignal = await uow.signals.update(signal.id, {
      reviewNote: 'Verified by compliance officer in synthetic test run.',
    });
    assert(updatedSignal.reviewNote?.includes('compliance officer') === true, 'Signal reviewNote updated');

    // ==========================================
    // 3. RELATIONSHIP & COMPARISON VERIFICATION
    // ==========================================
    const rel = await uow.relationships.save({
      id: '',
      sourceEntityId: initialVendor.id,
      targetEntityId: 'ven_synthetic_target_entity_02',
      relationshipType: 'SHARED_DIRECTOR',
      evidenceIds: [evidence.id],
      matchStrength: 'EXACT_IDENTIFIER',
      firstSeenAt: new Date().toISOString(),
      details: {
        directorName: 'Rajesh Sharma',
        din: '08219432',
      },
    });
    assert(rel.id.startsWith('rel_'), 'Relationship created with stable "rel_" ID');

    const readRel = await uow.relationships.findByEntityId(initialVendor.id);
    assert(readRel.length === 1, 'Relationship retrieved by entity ID');

    const comparison = await uow.comparisons.save({
      id: '',
      previousRunId: 'inv_run_1',
      currentRunId: investigation.id,
      newSignalIds: [signal.id],
      changedSignalIds: [],
      removedSignalIds: [],
      unresolvedSignalIds: [],
      comparedAt: new Date().toISOString(),
    });
    assert(comparison.id.startsWith('cmp_'), 'Comparison created with stable "cmp_" ID');

    // ==========================================
    // 4. DELETE VERIFICATION (CLEANUP)
    // ==========================================
    const vendorDeleted = await uow.vendors.delete(initialVendor.id);
    assert(vendorDeleted === true, 'Vendor delete returned true');

    const checkVendorGone = await uow.vendors.findById(initialVendor.id);
    assert(checkVendorGone === null, 'Vendor successfully purged from repository');

    await uow.evidence.delete(evidence.id);
    const checkEvidenceGone = await uow.evidence.findById(evidence.id);
    assert(checkEvidenceGone === null, 'Evidence successfully purged from repository');

    await uow.signals.delete(signal.id);
    const checkSignalGone = await uow.signals.findById(signal.id);
    assert(checkSignalGone === null, 'Signal successfully purged from repository');

    await uow.relationships.delete(rel.id);
    await uow.comparisons.delete(comparison.id);
    await uow.investigations.delete(investigation.id);

    details.push('All synthetic test records created, queried, updated, and purged successfully.');

    return {
      success: true,
      timestamp: new Date().toISOString(),
      storageMode: uow.getStorageMode().mode,
      isDurable: uow.getStorageMode().isDurable,
      assertionsPassed: passed,
      assertionsFailed: failed,
      details,
    };
  } catch (err: any) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      storageMode: uow.getStorageMode().mode,
      isDurable: uow.getStorageMode().isDurable,
      assertionsPassed: passed,
      assertionsFailed: failed + 1,
      details,
      error: err.message || String(err),
    };
  }
}
