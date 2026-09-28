import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { configSchema, services } from '../storage-s3/config.ts';
import { newLatePutReport, readReport, saveReport } from './report.ts';
import { runService, resumeCleanup } from './suite.ts';

assert.equal(process.versions.node.split('.')[0], '24');
const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    output: { type: 'string', default: 'test-results/upload-late-put' },
    'expires-in': { type: 'string', default: '900' },
    resume: { type: 'string' },
  },
});
const expiresIn = Number(values['expires-in']);
assert.ok(
  Number.isInteger(expiresIn) && expiresIn >= 2 && expiresIn <= 900,
  'expires-in must be 2–900 seconds; only 900 is the product window',
);
const configs = values.config
  ? configSchema
      .array()
      .parse(JSON.parse(await readFile(values.config, 'utf8')))
  : [];
assert.equal(
  new Set(configs.map((config) => config.service)).size,
  configs.length,
  'One target per service',
);
if (values.resume) {
  const path = resolve(values.resume);
  const previous = JSON.parse(await readFile(path, 'utf8'));
  const config = configs.find((config) => config.service === previous.service);
  assert.ok(
    config,
    'Resume requires explicit credentials for the original service',
  );
  const report = await readReport(path, config);
  await resumeCleanup(config, report, () => saveReport(path, report));
  console.log(`${report.service}: ${report.status}; ${path}`);
} else {
  const root = resolve(values.output);
  await mkdir(root, { recursive: true });
  const output = await mkdtemp(`${root}/run-`);
  for (const service of services) {
    const directory = `${output}/${service}`;
    await mkdir(directory);
    const path = `${directory}/report.json`;
    const report = newLatePutReport(service, expiresIn);
    const save = () => saveReport(path, report);
    const config = configs.find((config) => config.service === service);
    if (config) await runService(config, report, save, directory);
    else {
      report.checks.push({
        name: 'real-service-environment',
        status: 'incomplete',
        evidence:
          'No explicit test bucket configuration supplied; no remote operations attempted.',
      });
      await save();
    }
    console.log(`${service}: ${report.status}; ${path}`);
  }
}
// This diagnostic experiment does not establish a final settlement protocol.
process.exitCode = 1;
