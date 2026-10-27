import { runIndiacosResolutionTests } from './indiacosResolution.test.js';

async function main() {
  console.log('=== RUNNING INDIACOS VENDOR RESOLUTION TESTS ===');
  const report = await runIndiacosResolutionTests();
  console.log(`Success: ${report.success}`);
  console.log(`Assertions Passed: ${report.assertionsPassed}`);
  console.log(`Assertions Failed: ${report.assertionsFailed}`);
  console.log('\nAssertion Details:');
  report.details.forEach((d) => console.log(`  ${d}`));

  if (!report.success) {
    console.error('Test Failed:', report.error);
    process.exit(1);
  } else {
    console.log('\n=== ALL INDIACOS RESOLUTION TESTS PASSED ===');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
