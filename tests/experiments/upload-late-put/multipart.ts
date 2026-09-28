import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  CompleteMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { errorEvidence } from '../storage-s3/protocol.ts';
import { put, type PutResult } from './transport.ts';

export type MultipartTarget = {
  service: string;
  endpoint: string;
  region: string;
  bucket: string;
  forcePathStyle: boolean;
  credentials: { accessKeyId: string; secretAccessKey: string };
};
export type MultipartReport = {
  status: 'observed' | 'failed';
  service: string;
  bucket: string;
  key: string;
  uploadId?: string;
  events: { name: string; at: string; result?: unknown; error?: unknown }[];
  objectAbsent: boolean;
  backendPartsReclaimed: 'unverified';
};

// A diagnostic only: API visibility is not proof of provider-internal reclamation.
export async function runMultipart(
  target: MultipartTarget,
  save: (report: MultipartReport) => Promise<void>,
  timing: {
    intervalMs: number;
    abortDelayMs: number;
    spacingMs: number;
    requestTimeoutMs?: number;
  } = { intervalMs: 500, abortDelayMs: 1500, spacingMs: 1100 },
) {
  const client = new S3Client({
    ...target,
    maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    requestHandler: {
      requestTimeout: timing.requestTimeoutMs ?? 30_000,
      connectionTimeout: 10_000,
      throwOnRequestTimeout: true,
    },
  });
  const report: MultipartReport = {
    status: 'failed',
    service: target.service,
    bucket: target.bucket,
    key: `upload-v01/multipart/${randomUUID()}`,
    events: [],
    objectAbsent: false,
    backendPartsReclaimed: 'unverified',
  };
  const input = { Bucket: target.bucket, Key: report.key };
  let slow: Promise<PutResult> | undefined;
  let unexpectedFailure = false;
  const absentSessionExpected = new Set([
    'list-immediately-after-abort',
    'list-after-sender-settled',
    'repeat-abort',
    'complete-aborted-session',
    'cleanup-abort',
  ]);
  async function record<T>(name: string, action: () => Promise<T>) {
    const at = new Date().toISOString();
    try {
      const result = await action();
      report.events.push({ name, at, result });
      await save(report);
      return result;
    } catch (error) {
      const evidence = errorEvidence(error);
      const expected =
        (absentSessionExpected.has(name) &&
          evidence.httpStatusCode === 404 &&
          evidence.name === 'NoSuchUpload') ||
        ((name === 'cleanup-head' || name === 'head-after-complete-attempt') &&
          evidence.httpStatusCode === 404);
      if (!expected) unexpectedFailure = true;
      report.events.push({ name, at, error: evidence });
      await save(report);
      return undefined;
    }
  }
  async function recordPut(name: string, action: () => Promise<PutResult>) {
    return record(name, async () => {
      const sent = await action();
      if (!(
        sent.outcome === 'response' &&
        ((sent.status !== undefined &&
          sent.status >= 200 &&
          sent.status < 300) ||
          (sent.status === 404 && sent.code === 'NoSuchUpload'))
      ))
        unexpectedFailure = true;
      return sent;
    });
  }
  await save(report); // Exact key survives interruption before first mutation.
  try {
    const created = await record('create', async () => {
      const result = await client.send(new CreateMultipartUploadCommand(input));
      report.uploadId = result.UploadId;
      await save(report); // Persist the upload ID before sending any parts.
      return result;
    });
    if (!created?.UploadId) return report;
    const session = { ...input, UploadId: created.UploadId };
    const first = await record('upload-part-1', () =>
      client.send(
        new UploadPartCommand({
          ...session,
          PartNumber: 1,
          Body: Buffer.alloc(5 * 1024 * 1024, 0x61),
        }),
      ),
    );
    if (!first?.ETag) return report;
    await record('list-before-abort', () =>
      client.send(new ListPartsCommand(session)),
    );
    const signed = await getSignedUrl(
      client,
      new UploadPartCommand({
        ...session,
        PartNumber: 2,
      }),
      { expiresIn: 900 },
    );
    await delay(timing.spacingMs);
    slow = put(signed, {
      bytes: 5 * 1024 * 1024,
      chunkBytes: 256 * 1024,
      intervalMs: timing.intervalMs,
      timeoutMs: 30_000,
    });
    await delay(timing.abortDelayMs);
    await record('abort-during-send', () =>
      client.send(new AbortMultipartUploadCommand(session)),
    );
    await record('list-immediately-after-abort', () =>
      client.send(new ListPartsCommand(session)),
    );
    const sent = await slow;
    await recordPut('slow-part-result', async () => sent);
    await record('list-after-sender-settled', () =>
      client.send(new ListPartsCommand(session)),
    );
    await delay(timing.spacingMs);
    await record('repeat-abort', () =>
      client.send(new AbortMultipartUploadCommand(session)),
    );
    await delay(timing.spacingMs);
    await recordPut('replay-old-part-url', () =>
      put(signed, {
        bytes: 1024,
        chunkBytes: 1024,
        intervalMs: 0,
        timeoutMs: 30_000,
      }),
    );
    await delay(timing.spacingMs);
    await record('complete-aborted-session', () =>
      client.send(
        new CompleteMultipartUploadCommand({
          ...session,
          MultipartUpload: { Parts: [{ PartNumber: 1, ETag: first.ETag }] },
        }),
      ),
    );
    await record('head-after-complete-attempt', () =>
      client.send(new HeadObjectCommand(input)),
    );
    report.status = unexpectedFailure ? 'failed' : 'observed';
  } finally {
    // Always let our known sender settle before the final cleanup attempt.
    if (slow) await slow;
    await delay(timing.spacingMs);
    if (report.uploadId)
      await record('cleanup-abort', () =>
        client.send(
          new AbortMultipartUploadCommand({
            ...input,
            UploadId: report.uploadId,
          }),
        ),
      );
    await record('cleanup-delete', () =>
      client.send(new DeleteObjectCommand(input)),
    );
    await record('cleanup-head', async () => {
      try {
        return await client.send(new HeadObjectCommand(input));
      } catch (error) {
        if (errorEvidence(error).httpStatusCode === 404)
          report.objectAbsent = true;
        throw error;
      }
    });
    if (unexpectedFailure || !report.objectAbsent) report.status = 'failed';
    client.destroy();
    await save(report);
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
      output: {
        type: 'string',
        default: 'test-results/upload-v01-multipart',
      },
    },
  });
  if (!values.config) throw new Error('--config is required');
  const targets = JSON.parse(
    await readFile(values.config, 'utf8'),
  ) as MultipartTarget[];
  const output = resolve(values.output, `run-${Date.now()}`);
  await mkdir(output, { recursive: true });
  for (const target of targets) {
    const path = resolve(output, `${target.service}.json`);
    const report = await runMultipart(target, async (value) => {
      await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
        mode: 0o600,
      });
    });
    if (report.status === 'failed') process.exitCode = 1;
    console.log(
      `${target.service}: status=${report.status}; objectAbsent=${report.objectAbsent}; backendPartsReclaimed=unverified; ${path}`,
    );
  }
}
