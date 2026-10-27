import { runRiskFindingValidationTests } from './riskFindingValidation.test.js';
import { runDiscoveryOrchestrationTests } from './discoveryOrchestration.test.js';

async function main() {
  console.log('=== RUNNING VENDORTRACE LAYER 1 DISCOVERY & VALIDATION TEST SUITE ===');

  const validationReport = await runRiskFindingValidationTests();
  console.log('\n--- RISK FINDING VALIDATION SUITE ---');
  for (const log of validationReport.logs) {
    console.log(log);
  }
  console.log(`Passed: ${validationReport.assertionsPassed}, Failed: ${validationReport.assertionsFailed}`);

  const orchestrationReport = await runDiscoveryOrchestrationTests();
  console.log('\n--- DISCOVERY ORCHESTRATION SUITE ---');
  for (const log of orchestrationReport.logs) {
    console.log(log);
  }
  console.log(`Passed: ${orchestrationReport.assertionsPassed}, Failed: ${orchestrationReport.assertionsFailed}`);

  const allPassed = validationReport.success && orchestrationReport.success;
  if (!allPassed) {
    console.error('\nFAILED: One or more assertions failed.');
    process.exit(1);
  } else {
    console.log('\nSUCCESS: All Layer 1 Discovery and Validation tests passed cleanly!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error running discovery test suite:', err);
  process.exit(1);
});
