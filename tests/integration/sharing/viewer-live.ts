import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { stageError } from '../../../src/server/storage/probes.ts';
import { launchS3Delivery } from '../delivery/s3-fixture.ts';
import { verifyViewerRevocations } from './viewer-revocation-fixture.ts';

assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24');
const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    output: { type: 'string', default: 'test-results/sharing-viewer-live' },
  },
});
const targetSchema = z.object({
  service: z.enum(['r2', 'seaweedfs']),
  endpoint: z.url(),
  region: z.string().min(1),
  bucket: z.string().min(1),
  forcePathStyle: z.boolean(),
  credentials: z.object({
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
  }),
  serviceVersion: z.string().optional(),
});
const targets = values.config
  ? targetSchema
      .array()
      .parse(JSON.parse(await readFile(values.config, 'utf8')))
  : [];
assert.equal(new Set(targets.map((row) => row.service)).size, targets.length);
await mkdir(resolve(values.output), { recursive: true });
const output = await mkdtemp(join(resolve(values.output), 'run-'));
const controller = new AbortController();
const interrupt = () =>
  controller.abort(new Error('Sharing verification interrupted'));
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
let failed = false;
try {
  for (const service of ['r2', 'seaweedfs'] as const) {
    const target = targets.find((row) => row.service === service);
    const directory = join(output, service);
    await mkdir(directory);
    const report: Record<string, unknown> = {
      status: 'incomplete',
      service,
      startedAt: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      checks: [],
      cleanup: 'No remote objects created',
      limitations: [
        'Issued signatures are confirmed usable after revocation and declare 300 seconds. This run does not wait five minutes for actual expiry; existing delivery evidence covers expiry separately.',
      ],
    };
    let app: Awaited<ReturnType<typeof launchS3Delivery>> | undefined;
    try {
      if (!target) {
        failed = true;
        report.reason = 'No real service configuration supplied';
      } else {
        controller.signal.throwIfAborted();
        report.target = {
          endpoint: target.endpoint,
          bucket: target.bucket,
          serviceVersion: target.serviceVersion,
        };
        app = await launchS3Delivery(
          target,
          join(directory, 'keys.json'),
          controller.signal,
        );
        report.cleanup = 'Exact object keys registered before write';
        const asset = await app.seed({ fourVersions: true });
        report.checks = await verifyViewerRevocations(
          app,
          asset,
          app.storageId,
          's3',
          controller.signal,
        );
        report.status = 'passed';
      }
    } catch (error) {
      failed = true;
      report.status = 'failed';
      report.error = stageError(
        error,
        target ? Object.values(target.credentials) : [],
      );
    } finally {
      try {
        await app?.close();
        if (app)
          report.cleanup =
            'All fixture object keys deleted and absence checked';
      } catch (error) {
        failed = true;
        report.status = 'failed';
        report.cleanup = stageError(
          error,
          target ? Object.values(target.credentials) : [],
        );
      }
      report.finishedAt = new Date().toISOString();
      await writeFile(
        join(directory, 'report.json'),
        `${JSON.stringify(report, null, 2)}\n`,
      );
      console.log(
        `${service}: ${report.status}; ${join(directory, 'report.json')}`,
      );
    }
  }
} finally {
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
}
process.exitCode = failed ? 1 : 0;
