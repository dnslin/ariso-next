import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { runCollectionsExperiment } from './suite.ts';

const { values } = parseArgs({ options: { report: { type: 'string' } } });
if (!values.report) throw new Error('Required: --report <path>');
const report = await runCollectionsExperiment();
await mkdir(dirname(values.report), { recursive: true });
await writeFile(values.report, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    environment: report.environment,
    passed: report.passed,
    report: values.report,
  }),
);
