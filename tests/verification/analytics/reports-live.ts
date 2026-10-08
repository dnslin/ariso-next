import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { configSchema } from '../../experiments/storage-s3/config.ts';
import { verifyReportDelivery } from './report-delivery.ts';

assert.equal(process.versions.node.split('.')[0], '24');
const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    output: { type: 'string', default: 'test-results/analytics-169/live' },
  },
});
assert.ok(values.config, 'Provide the private R2/SeaweedFS configuration');
const fields = configSchema.shape;
const targets = z
  .array(
    z.object({
      service: z.enum(['r2', 'seaweedfs']),
      endpoint: fields.endpoint,
      region: fields.region,
      bucket: fields.bucket,
      forcePathStyle: fields.forcePathStyle,
      credentials: fields.credentials,
    }),
  )
  .parse(JSON.parse(await readFile(values.config, 'utf8')));
assert.deepEqual(targets.map((target) => target.service).sort(), [
  'r2',
  'seaweedfs',
]);
await mkdir(resolve(values.output), { recursive: true });
for (const target of targets) {
  const report = await verifyReportDelivery(target);
  await writeFile(
    join(values.output, `${target.service}.json`),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(`${target.service}: ${report.status}`);
}
