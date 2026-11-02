// Run with `node test/preflight.mjs` before the suite. A run against a missing
// database otherwise fails file by file — each boot() prints the same "is not
// reachable" hint, 200-odd times, before the suite gives up. One probe up front
// turns that into one message and a stop before the test files start, and a
// passing probe costs a couple of milliseconds the suite never notices.
import { checkTestDatabase } from './helpers.mjs';

try {
  await checkTestDatabase();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
