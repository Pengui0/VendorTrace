/**
 * Master Test Runner for VendorTrace
 * Executes all test suites across all 4 layers, providers, security, and exports.
 */

import { runDiscoveryOrchestrationTests } from './discoveryOrchestration.test.js';
import { runRiskFindingValidationTests } from './riskFindingValidation.test.js';
import { runIndiacosResolutionTests } from './indiacosResolution.test.js';
import { runTinyFishStreamingTests } from './tinyfishStreaming.test.js';
import { runTinyFishIntegrationTests } from './tinyfishTest.test.js';
import { runTinyFishDebarmentTests } from './tinyfishDebarment.test.js';
import { runEntityTracingTests } from './entityTracing.test.js';
import { runCrossValidationTests } from './crossValidation.test.js';
import { runGraphNetworkTests } from './graphNetwork.test.js';
import { runChangeDetectionTests } from './changeDetection.test.js';
import { runExportTests } from './exportService.test.js';
import { runFilterTests } from './investigationFilter.test.js';
import { runSecurityHardeningTests } from './securityHardening.test.js';
import { runIntegrationTests } from './integrations.test.js';
import { runDemoConsistencyTests } from './demoConsistency.test.js';
import { runLiveProviderContractTests } from './liveProviderContract.test.js';
import { runLocalStoragePersistenceTests } from './localStoragePersistence.test.js';
import { runCustomVendorSearchTests } from './customVendorSearch.test.js';
import { runRepositoryVerification } from './repositoryVerification.test.js';
import { runAssessmentDisplayTests } from './assessmentDisplay.test.js';
import { runInvestigationComparisonTests } from './investigationComparison.test.js';

interface TestResult {
  assertionsPassed: number;
  assertionsFailed: number;
  logs?: string[];
  details?: string[];
}

interface TestSuite {
  name: string;
  fn: () => Promise<TestResult>;
}

const suites: TestSuite[] = [
  { name: 'Layer 1: Discovery Orchestration', fn: runDiscoveryOrchestrationTests },
  { name: 'Layer 1: Risk Finding Validation & Normalization', fn: runRiskFindingValidationTests },
  { name: 'Identity Resolution: IndiaCos Provider', fn: runIndiacosResolutionTests },
  { name: 'Streaming: TinyFish Live SSE & Progress Adapter', fn: runTinyFishStreamingTests },
  { name: 'TinyFish Baseline Extraction Contract', fn: runTinyFishIntegrationTests },
  { name: 'TinyFish Search + Fetch Debarment Evidence', fn: runTinyFishDebarmentTests },
  { name: 'Layer 2: Entity Tracing & Candidate Discovery', fn: runEntityTracingTests },
  { name: 'Layer 3: Cross-Validation & Deterministic Scoring', fn: runCrossValidationTests },
  { name: 'Layer 4: Entity Graph Network Modeling', fn: runGraphNetworkTests },
  { name: 'Layer 4: Monitoring & Change Detection Diff Engine', fn: runChangeDetectionTests },
  { name: 'Export Service: PDF & CSV RFC 4180 Registers', fn: runExportTests },
  { name: 'Workflows: Multi-Attribute Investigation Search & Filtering', fn: runFilterTests },
  { name: 'Security Hardening: SSRF Allowlist, Payloads & Auth', fn: runSecurityHardeningTests },
  { name: 'End-to-End Orchestration Integration Pipeline', fn: runIntegrationTests },
  { name: 'Demo Fixture Integrity & Confidence Consistency', fn: runDemoConsistencyTests },
  { name: 'Live Provider Contract Tests (Mocked HTTP)', fn: runLiveProviderContractTests },
  { name: 'Browser LocalStorage Persistence (Offline)', fn: runLocalStoragePersistenceTests },
  { name: 'Custom Vendor Search & Resolver UI Flow (Offline)', fn: runCustomVendorSearchTests },
  { name: 'Repository Persistence & Name-Only Investigations', fn: async () => {
    const report = await runRepositoryVerification();
    return {
      assertionsPassed: report.assertionsPassed,
      assertionsFailed: report.assertionsFailed,
      logs: report.details,
    };
  } },
  { name: 'Assessment Score & Vendor Trend Display', fn: runAssessmentDisplayTests },
  { name: 'Investigation Comparison Input Validation', fn: runInvestigationComparisonTests },
];

async function runAll() {
  console.log('================================================================');
  console.log('       VENDORTRACE COMPLETE END-TO-END TEST SUITE RUNNER        ');
  console.log('================================================================\n');

  let totalPassed = 0;
  let totalFailed = 0;
  const summary: { name: string; passed: number; failed: number }[] = [];

  for (let i = 0; i < suites.length; i++) {
    const s = suites[i];
    console.log(`>>> [${i + 1}/${suites.length}] Running ${s.name}...`);
    try {
      const res = await s.fn();
      totalPassed += res.assertionsPassed;
      totalFailed += res.assertionsFailed;
      summary.push({ name: s.name, passed: res.assertionsPassed, failed: res.assertionsFailed });
      if (res.assertionsFailed > 0) {
        console.error(`    FAILED with ${res.assertionsFailed} failure(s)`);
      } else {
        console.log(`    PASSED (${res.assertionsPassed} assertions)`);
      }
    } catch (err: any) {
      console.error(`    FATAL ERROR in ${s.name}:`, err.message || err);
      totalFailed += 1;
      summary.push({ name: s.name, passed: 0, failed: 1 });
    }
  }

  console.log('\n================================================================');
  console.log('                     SUITE EXECUTION SUMMARY                    ');
  console.log('================================================================');
  for (const row of summary) {
    const status = row.failed === 0 ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${row.name.padEnd(58)} | ${String(row.passed).padStart(2)} passed, ${row.failed} failed`);
  }
  console.log('----------------------------------------------------------------');
  console.log(`TOTAL: ${totalPassed} Passed, ${totalFailed} Failed across ${suites.length} suites.`);
  console.log('================================================================');

  if (totalFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAll().catch((err) => {
  console.error('Fatal unhandled error:', err);
  process.exit(1);
});
