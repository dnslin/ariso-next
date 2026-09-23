import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { services } from '../storage-s3/config.ts';
import { errorEvidence } from '../storage-s3/protocol.ts';
import { commonCapacity, type Sample } from './boundary.ts';
import { newReport, probe, targetSchema } from './probe.ts';

assert.equal(process.versions.node.split('.')[0], '24');
const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    bytes: { type: 'string', default: '52428800' },
    output: { type: 'string', default: 'test-results/upload-capacity' },
    'timeout-ms': { type: 'string', default: '1800000' },
  },
});
const sizes = [...new Set(values.bytes.split(',').map(Number))].sort(
  (a, b) => a - b,
);
assert.ok(
  sizes.length > 0 &&
    sizes.every((value) => Number.isSafeInteger(value) && value > 0),
  'Supply positive integer byte counts',
);
const timeoutMs = Number(values['timeout-ms']);
assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0);
const configs = values.config
  ? targetSchema
      .array()
      .parse(JSON.parse(await readFile(values.config, 'utf8')))
  : [];
assert.equal(
  new Set(configs.map((config) => config.service)).size,
  configs.length,
);
const root = resolve(values.output);
await mkdir(root, { recursive: true });
const output = await mkdtemp(`${root}/run-`);
const boundaries: Record<(typeof services)[number], number | null> = {
  aws: null,
  r2: null,
  seaweedfs: null,
};
const samples: Record<(typeof services)[number], Sample[]> = {
  aws: [],
  r2: [],
  seaweedfs: [],
};
let operationsComplete = true;
for (const service of services) {
  const config = configs.find((value) => value.service === service);
  const report = newReport({
    service,
    endpoint: config?.endpoint ?? 'not configured',
    bucket: config?.bucket ?? 'not configured',
  });
  const save = async () => {
    await writeFile(
      `${output}/${service}.json.tmp`,
      JSON.stringify(report, null, 2) + '\n',
    );
    await rename(`${output}/${service}.json.tmp`, `${output}/${service}.json`);
  };
  await save();
  if (config) {
    try {
      await probe(config, sizes, report, save, timeoutMs);
    } catch (error) {
      report.errors.push(errorEvidence(error));
      console.error(service, errorEvidence(error));
    }
  }
  const measured =
    report.errors.length === 0 &&
    report.samples.length === sizes.length &&
    report.samples.every(
      (sample) =>
        sample.operations.length > 0 &&
        sample.operations.every(
          (operation) =>
            operation.status === 'passed' ||
            operation.status === 'size-rejected',
        ) &&
        sample.cleanup.length === 2 &&
        sample.cleanup.every(
          (entry) => (entry as { status: string }).status === 'deleted',
        ),
    );
  report.status = measured ? 'measured' : 'incomplete';
  operationsComplete &&= measured;
  // Boundary observations are separate from transport timeout and final cleanup acceptance.
  boundaries[service] = report.boundary.exactBytes;
  samples[service] = report.samples;
  await save();
  console.log(
    `${service}: ${JSON.stringify(report.boundary)}; ${output}/${service}.json`,
  );
}
const capacity = commonCapacity(samples);
const complete = operationsComplete && capacity !== null;
await writeFile(
  `${output}/summary.json`,
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      timeoutMs,
      sizes,
      boundaries,
      commonCapacity: capacity,
      status: complete ? 'passed' : 'incomplete',
      remaining: [
        'Real transport timeout acceptance is reported separately',
        'Interrupted or timed-out remote PUT may finish after DELETE; reconcile recorded keys after the writer ends',
      ],
    },
    null,
    2,
  ) + '\n',
);
if (!complete) process.exitCode = 1;
