import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  S3Client,
  CreateMultipartUploadCommand,
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { errorEvidence } from '../storage-s3/protocol.ts';
import type { MultipartTarget } from './multipart.ts';

export type CreationReport = {
  service: string;
  bucket: string;
  key: string;
  startedAt: string;
  status: 'observed' | 'failed';
  providerStatus?: number;
  clientError?: ReturnType<typeof errorEvidence>;
  uploadIds: string[];
  objectAbsent: boolean;
  sessionsAbsent: boolean;
  productionReleasePermitted: false;
  limitation: string;
  events: {
    name: string;
    at: string;
    result?: unknown;
    error?: ReturnType<typeof errorEvidence>;
  }[];
};
export async function runCreation(
  target: MultipartTarget,
  save: (report: CreationReport) => Promise<void>,
) {
  const report: CreationReport = {
    service: target.service,
    bucket: target.bucket,
    key: `ariso/upload-v01/creation/${randomUUID()}`,
    startedAt: new Date().toISOString(),
    status: 'failed',
    uploadIds: [],
    objectAbsent: false,
    sessionsAbsent: false,
    productionReleasePermitted: false,
    limitation:
      'The injected loss occurs after the complete provider response. An empty list cannot prove an unresolved in-flight Create has settled. No parts are uploaded; backend reclamation is not inferred.',
    events: [],
  };
  // Persist exact responsibility before any request can create a remote session.
  await save(report);
  const options = {
    ...target,
    maxAttempts: 1,
    requestHandler: {
      requestTimeout: 30_000,
      connectionTimeout: 10_000,
      throwOnRequestTimeout: true,
    },
  };
  const client = new S3Client(options);
  const lossy = new S3Client(options);
  const input = { Bucket: target.bucket, Key: report.key };
  let failed = false;
  async function record<T>(name: string, action: () => Promise<T>) {
    const at = new Date().toISOString();
    try {
      const result = await action();
      report.events.push({ name, at, result });
      await save(report);
      return result;
    } catch (error) {
      failed = true;
      report.events.push({ name, at, error: errorEvidence(error) });
      await save(report);
      return undefined;
    }
  }
  async function discover(name: string) {
    return record(name, async () => {
      const listed = await client.send(
        new ListMultipartUploadsCommand({
          Bucket: target.bucket,
          Prefix: report.key,
        }),
      );
      const exact = (listed.Uploads ?? []).filter(
        (upload) => upload.Key === report.key,
      );
      for (const upload of exact) {
        assert.ok(upload.UploadId, 'Exact-key session missing UploadId');
        if (!report.uploadIds.includes(upload.UploadId))
          report.uploadIds.push(upload.UploadId);
      }
      await save(report); // Save discovered IDs before abort; no neighboring prefix keys are retained.
      assert.equal(
        listed.IsTruncated,
        false,
        'Truncated listing is incomplete; pagination is not implemented in this bounded diagnostic',
      );
      return {
        exactUploadIds: exact.map((upload) => upload.UploadId),
        requestId: listed.$metadata.requestId,
        truncated: listed.IsTruncated,
      };
    });
  }
  const handler = lossy.config.requestHandler;
  const original = handler.handle.bind(handler);
  handler.handle = async (...args: Parameters<typeof original>) => {
    const result = await original(...args);
    report.providerStatus = result.response.statusCode;
    for await (const chunk of result.response.body) void chunk;
    // Do not parse or retain the successful response UploadId: recovery must list the known Key.
    throw Object.assign(
      new Error(
        'Injected loss after provider response drained; SDK received no Create acknowledgement',
      ),
      { name: 'InjectedResponseLoss', code: 'ECONNRESET' },
    );
  };
  try {
    await record('create-response-lost', async () => {
      try {
        await lossy.send(new CreateMultipartUploadCommand(input));
      } catch (error) {
        report.clientError = errorEvidence(error);
      }
      assert.equal(report.providerStatus, 200);
      assert.equal(report.clientError?.name, 'InjectedResponseLoss');
      return {
        providerStatus: report.providerStatus,
        clientError: report.clientError,
      };
    });
    const discovered = await discover('recover-by-exact-key');
    if (report.providerStatus === 200 && !discovered?.exactUploadIds.length)
      failed = true;
  } finally {
    try {
      // A second bounded discovery also attempts cleanup when the initial observation failed.
      await discover('cleanup-discover');
      for (const UploadId of report.uploadIds)
        await record('cleanup-abort', async () => {
          const result = await client.send(
            new AbortMultipartUploadCommand({ ...input, UploadId }),
          );
          return {
            uploadId: UploadId,
            status: result.$metadata.httpStatusCode,
            requestId: result.$metadata.requestId,
          };
        });
      const remaining = await discover('cleanup-list-after-abort');
      report.sessionsAbsent =
        remaining !== undefined && remaining.exactUploadIds.length === 0;
      await record('cleanup-head', async () => {
        try {
          await client.send(new HeadObjectCommand(input));
          throw new Error('Unexpected completed object; no Complete was sent');
        } catch (error) {
          if (errorEvidence(error).httpStatusCode !== 404) throw error;
          report.objectAbsent = true;
          return { status: 404 };
        }
      });
      report.status =
        !failed && report.sessionsAbsent && report.objectAbsent
          ? 'observed'
          : 'failed';
    } finally {
      client.destroy();
      lossy.destroy();
      await save(report);
    }
  }
  return report;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { values } = parseArgs({
    options: {
      config: { type: 'string' },
      output: { type: 'string', default: 'test-results/upload-v01-creation' },
    },
  });
  if (!values.config) throw new Error('--config is required');
  const targets = JSON.parse(
    await readFile(values.config, 'utf8'),
  ) as MultipartTarget[];
  const directory = resolve(values.output, `run-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  for (const target of targets) {
    const path = resolve(directory, `${target.service}.json`);
    const report = await runCreation(target, async (value) => {
      await writeFile(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`, {
        mode: 0o600,
      });
      await rename(`${path}.tmp`, path);
    });
    if (report.status === 'failed') process.exitCode = 1;
    console.log(
      `${target.service}: ${report.status}; objectAbsent=${report.objectAbsent}; sessionsAbsent=${report.sessionsAbsent}; ${path}`,
    );
  }
}
