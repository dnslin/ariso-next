import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { configSchema } from '../storage-s3/config.ts';
import { runUsageService } from './live.ts';

assert.equal(process.versions.node.split('.')[0], '24');
const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    output: { type: 'string', default: 'test-results/analytics-usage-live' },
  },
});
assert.ok(
  values.config,
  'Provide the private R2/SeaweedFS test configuration file',
);
const fields = configSchema.shape;
const targetSchema = z.object({
  service: z.enum(['r2', 'seaweedfs']),
  endpoint: fields.endpoint,
  region: fields.region,
  bucket: fields.bucket,
  forcePathStyle: fields.forcePathStyle,
  credentials: fields.credentials,
});
const configs = targetSchema
  .array()
  .parse(JSON.parse(await readFile(values.config, 'utf8')));
assert.deepEqual(configs.map((item) => item.service).sort(), [
  'r2',
  'seaweedfs',
]);
await mkdir(resolve(values.output), { recursive: true });
const directory = await mkdtemp(resolve(values.output) + '/run-');
for (const config of configs) {
  const report = await runUsageService(
    config,
    `${directory}/${config.service}`,
  );
  console.log(
    `${config.service}: ${report.status}; ${directory}/${config.service}/report.json`,
  );
  if (report.status !== 'passed') process.exitCode = 1;
}
