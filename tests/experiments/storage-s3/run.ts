import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { configSchema, services } from './config.ts';
import { newReport, runService } from './suite.ts';
import { browserProbe } from './browser.ts';

assert.equal(process.versions.node.split('.')[0], '24');
const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    output: { type: 'string', default: 'test-results/storage-s3' },
  },
});
const configs = values.config
  ? configSchema
      .array()
      .parse(JSON.parse(await readFile(values.config, 'utf8')))
  : [];
assert.equal(
  new Set(configs.map((item) => item.service)).size,
  configs.length,
  'Supply at most one target per service',
);
const outputRoot = resolve(values.output);
await mkdir(outputRoot, { recursive: true });
const output = await mkdtemp(`${outputRoot}/run-`);
const spaceId = Number(process.env.EGO_TASK_SPACE);
let complete = true;
for (const service of services) {
  const directory = `${output}/${service}`;
  await mkdir(directory, { recursive: true });
  const report = newReport(service);
  // Keep the previous exact-key record if the process stops during a later checkpoint.
  const save = async () => {
    await writeFile(
      `${directory}/report.json.tmp`,
      JSON.stringify(report, null, 2) + '\n',
    );
    await rename(`${directory}/report.json.tmp`, `${directory}/report.json`);
  };
  const config = configs.find((item) => item.service === service);
  if (!config) {
    report.checks.push({
      name: 'real-service-environment',
      status: 'incomplete',
      evidence:
        'No explicit test bucket configuration/credentials supplied; no remote operations attempted',
    });
    await save();
  } else
    await runService(
      config,
      report,
      save,
      spaceId ? browserProbe(spaceId, directory) : undefined,
    );
  console.log(`${service}: ${report.status}; ${directory}/report.json`);
  complete &&= report.status === 'passed';
}
// Missing credentials never produce a successful acceptance exit status.
if (!complete) process.exitCode = 1;
