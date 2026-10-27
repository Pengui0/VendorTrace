/**
 * Runner for Phase 4 Tests: Exports (PDF/CSV), Multi-Filter Search, and Security Hardening
 */

import { runExportTests } from './exportService.test.js';
import { runFilterTests } from './investigationFilter.test.js';
import { runSecurityHardeningTests } from './securityHardening.test.js';

async function main() {
  console.log('================================================================');
  console.log('   VENDORTRACE PHASE 4 TESTS: EXPORTS, FILTER & SECURITY        ');
  console.log('================================================================\n');

  console.log('>>> [1/3] Running Export Service Tests (PDF, CSV, Unicode, RFC 4180)...');
  const exportReport = await runExportTests();
  for (const log of exportReport.logs) {
    console.log(log);
  }
  console.log(`Export Tests Passed: ${exportReport.assertionsPassed}, Failed: ${exportReport.assertionsFailed}\n`);

  console.log('>>> [2/3] Running Multi-Attribute Filter & Search Tests...');
  const filterReport = await runFilterTests();
  for (const log of filterReport.logs) {
    console.log(log);
  }
  console.log(`Filter Tests Passed: ${filterReport.assertionsPassed}, Failed: ${filterReport.assertionsFailed}\n`);

  console.log('>>> [3/3] Running Security Hardening, SSRF & Injection Defense Tests...');
  const securityReport = await runSecurityHardeningTests();
  for (const log of securityReport.logs) {
    console.log(log);
  }
  console.log(`Security Hardening Passed: ${securityReport.assertionsPassed}, Failed: ${securityReport.assertionsFailed}\n`);

  const totalPassed = exportReport.assertionsPassed + filterReport.assertionsPassed + securityReport.assertionsPassed;
  const totalFailed = exportReport.assertionsFailed + filterReport.assertionsFailed + securityReport.assertionsFailed;

  console.log('================================================================');
  console.log(`OVERALL PHASE 4 RESULT: ${totalPassed} Passed, ${totalFailed} Failed`);
  console.log('================================================================');

  if (totalFailed > 0) {
    console.error('\nFAILURE: One or more Phase 4 assertions failed.');
    process.exit(1);
  } else {
    console.log('\nSUCCESS: All Phase 4 Export, Search/Filter, and Security Hardening tests passed cleanly!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error during Phase 4 test execution:', err);
  process.exit(1);
});
