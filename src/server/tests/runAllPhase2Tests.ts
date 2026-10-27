import { runTinyFishStreamingTests } from './tinyfishStreaming.test.js';
import { runEntityTracingTests } from './entityTracing.test.js';

async function main() {
  console.log('=== RUNNING TINYFISH STREAMING & LAYER 2 ENTITY TRACING TESTS ===');

  const streamReport = await runTinyFishStreamingTests();
  console.log('\n--- TINYFISH STREAMING TEST REPORT ---');
  for (const log of streamReport.logs) {
    console.log(log);
  }
  console.log(`Passed: ${streamReport.assertionsPassed}, Failed: ${streamReport.assertionsFailed}`);

  const traceReport = await runEntityTracingTests();
  console.log('\n--- LAYER 2 ENTITY TRACING TEST REPORT ---');
  for (const log of traceReport.logs) {
    console.log(log);
  }
  console.log(`Passed: ${traceReport.assertionsPassed}, Failed: ${traceReport.assertionsFailed}`);

  const allPassed = streamReport.success && traceReport.success;
  if (!allPassed) {
    console.error('\nFAILED: One or more assertions failed.');
    process.exit(1);
  } else {
    console.log('\nSUCCESS: All Streaming & Entity Tracing tests passed cleanly!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
