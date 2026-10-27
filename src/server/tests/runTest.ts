import { runRepositoryVerification } from './repositoryVerification.test.js';

async function main() {
  console.log('=== RUNNING VENDORTRACE PERSISTENCE VERIFICATION TEST ===');
  const report = await runRepositoryVerification();
  console.log(`Success: ${report.success}`);
  console.log(`Storage Mode: ${report.storageMode}`);
  console.log(`Durable: ${report.isDurable}`);
  console.log(`Assertions Passed: ${report.assertionsPassed}`);
  console.log(`Assertions Failed: ${report.assertionsFailed}`);
  console.log('\nAssertion Details:');
  report.details.forEach((d) => console.log(`  ${d}`));

  if (!report.success) {
    console.error('Test Failed:', report.error);
    process.exit(1);
  } else {
    console.log('\n=== ALL PERSISTENCE TESTS PASSED SUCCESSFULLY ===');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
