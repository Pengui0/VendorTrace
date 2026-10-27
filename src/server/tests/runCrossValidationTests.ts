import { runCrossValidationTests } from './crossValidation.test.js';

async function main() {
  console.log('=== RUNNING LAYER 3 CROSS-VALIDATION & DETERMINISTIC SCORING TESTS ===');
  const report = await runCrossValidationTests();
  for (const log of report.logs) {
    console.log(log);
  }
  console.log(`\nPassed: ${report.assertionsPassed}, Failed: ${report.assertionsFailed}`);

  if (!report.success) {
    console.error('\nFAILED: One or more assertions failed.');
    process.exit(1);
  } else {
    console.log('\nSUCCESS: All Layer 3 Cross-Validation & Scoring tests passed cleanly!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
