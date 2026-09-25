import { it } from 'vitest';
import { buildExperiment } from '../../experiments/analytics/harness.ts';
import { runLifecycle } from '../../experiments/analytics/run.ts';

it('real Next standalone drains in-flight transfers before final SQLite flush; crash and write-failure losses are bounded and reported', async () => {
  await buildExperiment();
  await runLifecycle('test-results/analytics/lifecycle.json');
}, 180000);
