/**
 * Runner for Phase 3 Tests: Change Detection, Signal Fingerprinting, and Related-Entity Network Graph
 */

import { runChangeDetectionTests } from './changeDetection.test.js';
import { runGraphNetworkTests } from './graphNetwork.test.js';

async function main() {
  console.log('================================================================');
  console.log('   VENDORTRACE PHASE 3 TESTS: CHANGE DETECTION & NETWORK GRAPH  ');
  console.log('================================================================\n');

  console.log('>>> [1/2] Running Change Detection & Signal Fingerprinting Tests...');
  const changeReport = await runChangeDetectionTests();
  for (const log of changeReport.logs) {
    console.log(log);
  }
  console.log(`Change Detection Passed: ${changeReport.assertionsPassed}, Failed: ${changeReport.assertionsFailed}\n`);

  console.log('>>> [2/2] Running Related-Entity Network Graph & Accessibility Tests...');
  const graphReport = await runGraphNetworkTests();
  for (const log of graphReport.logs) {
    console.log(log);
  }
  console.log(`Graph Network Passed: ${graphReport.assertionsPassed}, Failed: ${graphReport.assertionsFailed}\n`);

  const totalPassed = changeReport.assertionsPassed + graphReport.assertionsPassed;
  const totalFailed = changeReport.assertionsFailed + graphReport.assertionsFailed;

  console.log('================================================================');
  console.log(`OVERALL PHASE 3 RESULT: ${totalPassed} Passed, ${totalFailed} Failed`);
  console.log('================================================================');

  if (totalFailed > 0) {
    console.error('\nFAILURE: One or more Phase 3 assertions failed.');
    process.exit(1);
  } else {
    console.log('\nSUCCESS: All Phase 3 Change Detection and Graph Network tests passed!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error during Phase 3 test execution:', err);
  process.exit(1);
});
