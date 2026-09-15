import { runPreflight } from '../server/startup/preflight.ts';

try {
  runPreflight();
} catch (error) {
  console.error('prestart failed:', error);
  process.exitCode = 1;
}
