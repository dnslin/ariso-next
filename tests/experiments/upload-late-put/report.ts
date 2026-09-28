import { readFile, rename, writeFile } from 'node:fs/promises';
import type { Service, StorageConfig } from '../storage-s3/config.ts';
import { newReport, type Report } from '../storage-s3/suite.ts';

export type LatePutReport = Report & {
  experiment: 'UPLOAD-V01';
  expiresIn: number;
  release: { permitted: false; reason: string };
};

export function newLatePutReport(
  service: Service,
  expiresIn: number,
): LatePutReport {
  return {
    ...newReport(service),
    experiment: 'UPLOAD-V01',
    expiresIn,
    release: {
      permitted: false,
      reason:
        'Single PUT has no verified provider-side settlement barrier; observations cannot authorize reference release.',
    },
  };
}

export async function saveReport(path: string, report: LatePutReport) {
  await writeFile(`${path}.tmp`, JSON.stringify(report, null, 2) + '\n');
  await rename(`${path}.tmp`, path);
}

export async function readReport(
  path: string,
  config: StorageConfig,
): Promise<LatePutReport> {
  const report: LatePutReport = JSON.parse(await readFile(path, 'utf8'));
  if (
    report.experiment !== 'UPLOAD-V01' ||
    report.service !== config.service ||
    report.target?.endpoint !== config.endpoint ||
    report.target.bucket !== config.bucket ||
    report.target.revision !== config.revision
  ) {
    throw new Error(
      'Resume requires the original experiment target and configuration revision',
    );
  }
  return report;
}
