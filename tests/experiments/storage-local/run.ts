import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { runLocalExperiment } from './suite.ts';

const { values } = parseArgs({
  options: {
    'source-root': { type: 'string' },
    'storage-root': { type: 'string' },
    'target-root': { type: 'string' },
    'low-space-root': { type: 'string' },
    report: { type: 'string' },
    'require-complete': { type: 'boolean', default: false },
  },
});
if (!values['source-root'] || !values['storage-root'] || !values.report) {
  throw new Error(
    'Required: --source-root --storage-root --report; optional: --target-root --low-space-root --require-complete',
  );
}
const report = await runLocalExperiment({
  sourceRoot: values['source-root'],
  storageRoot: values['storage-root'],
  targetRoot: values['target-root'],
  lowSpaceRoot: values['low-space-root'],
});
await mkdir(dirname(values.report), { recursive: true });
await writeFile(values.report, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (values['require-complete'] && report.incomplete.length) {
  throw new Error(`Missing real environments: ${report.incomplete.join(', ')}`);
}
