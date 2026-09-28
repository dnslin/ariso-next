import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from '../storage-s3/config.ts';
import {
  checkCapabilities,
  createClient,
  errorEvidence,
  signProbe,
  signatureEvidence,
} from '../storage-s3/protocol.ts';
import { browserProbe } from '../storage-s3/browser.ts';
import type { LatePutReport } from './report.ts';
import { put } from './transport.ts';

type Client = ReturnType<typeof createClient>;
type Save = () => Promise<void>;

async function observe(client: Client, config: StorageConfig, key: string) {
  try {
    const result = await client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    return {
      at: new Date().toISOString(),
      exists: true,
      bytes: result.ContentLength,
      etag: result.ETag,
      metadata: result.$metadata,
    };
  } catch (error) {
    const evidence = errorEvidence(error);
    if (evidence.httpStatusCode !== 404) throw error;
    return { at: new Date().toISOString(), exists: false, error: evidence };
  }
}

async function remove(client: Client, config: StorageConfig, key: string) {
  const result = await client.send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
  );
  const head = await observe(client, config, key);
  assert.equal(
    head.exists,
    false,
    'Object is still visible after DeleteObject',
  );
  return {
    key,
    deletedAt: new Date().toISOString(),
    metadata: result.$metadata,
    head,
    referenceRetained: true,
  };
}

async function checkpoint(
  report: LatePutReport,
  save: Save,
  name: string,
  action: () => Promise<unknown>,
) {
  try {
    const evidence = await action();
    report.checks.push({ name, status: 'passed', evidence });
  } catch (error) {
    report.checks.push({
      name,
      status: 'failed',
      evidence: errorEvidence(error),
    });
    throw error;
  } finally {
    await save();
  }
}

async function cleanup(
  client: Client,
  config: StorageConfig,
  report: LatePutReport,
  save: Save,
  name: string,
) {
  for (const key of report.keys) {
    try {
      await checkpoint(report, save, `${name}:${key}`, () =>
        remove(client, config, key),
      );
    } catch {
      // Failed checks retain their exact key/error; continue the other independent keys.
      report.status = 'failed';
    }
  }
  await save();
}

export async function resumeCleanup(
  config: StorageConfig,
  report: LatePutReport,
  save: Save,
) {
  const client = createClient(config);
  try {
    await cleanup(client, config, report, save, 'restart-cleanup-observation');
    // Even a fresh process observing 404 has not proved absence of remote in-flight requests.
  } finally {
    client.destroy();
  }
}

export async function runService(
  config: StorageConfig,
  report: LatePutReport,
  save: Save,
  directory: string,
) {
  const client = createClient(config);
  const { endpoint, bucket, region, forcePathStyle, serviceVersion, revision } =
    config;
  report.target = {
    endpoint,
    bucket,
    region,
    forcePathStyle,
    serviceVersion,
    revision,
  };
  report.ownerConfirmation = config.ownerConfirmation;
  const prefix = `ariso/upload-v01/${randomUUID()}`;
  const keys = {
    upload: `${prefix}/upload.bin`,
    probe: `${prefix}/probe.bin`,
    source: `${prefix}/server-source.bin`,
    copy: `${prefix}/server-copy.bin`,
  };
  const input = (Key: string) => ({ Bucket: bucket, Key });
  try {
    await checkpoint(report, save, 'ordinary-bucket', () =>
      checkCapabilities(client, config),
    );
    report.keys = Object.values(keys);
    await save(); // Journal ownership before signing or sending any remote write.
    for (const role of ['upload', 'probe'] as const) {
      const key = keys[role];
      const signingDate = new Date();
      const expiresAt = new Date(
        Math.floor(signingDate.getTime() / 1000) * 1000 +
          report.expiresIn * 1000,
      );
      report.putValidUntil = expiresAt.toISOString();
      await save();
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({
          ...input(key),
          ContentType: 'application/octet-stream',
        }),
        {
          expiresIn: report.expiresIn,
          signingDate,
          signableHeaders: new Set(['content-type']),
        },
      );
      const fast = {
        bytes: 65536,
        chunkBytes: 65536,
        intervalMs: 0,
        timeoutMs: 30_000,
      };
      await checkpoint(
        report,
        save,
        `${role}:delete-then-replay-valid-signature`,
        async () => {
          const first = await put(url, fast);
          assert.equal(first.status, 200, JSON.stringify(first));
          const deleted = await remove(client, config, key);
          const replay = await put(url, fast);
          const head = await observe(client, config, key);
          assert.equal(replay.status, 200, JSON.stringify(replay));
          assert.equal(head.bytes, fast.bytes);
          return {
            signature: signatureEvidence(url),
            expiresAt: expiresAt.toISOString(),
            first,
            deleted,
            replay,
            head,
          };
        },
      );
      await checkpoint(
        report,
        save,
        `${role}:cancel-is-not-settlement`,
        async () => {
          const cancelled = await put(url, {
            ...fast,
            bytes: 1024 * 1024,
            chunkBytes: 65536,
            intervalMs: 100,
            abortAfterBytes: 131072,
          });
          assert.equal(cancelled.outcome, 'aborted', JSON.stringify(cancelled));
          return {
            cancelled,
            cleanup: await remove(client, config, key),
            referenceRetained: true,
          };
        },
      );
      await checkpoint(
        report,
        save,
        `${role}:start-before-expiry-finish-after`,
        async () => {
          assert.ok(
            Date.now() < expiresAt.getTime(),
            'Setup consumed the signature window; rerun with a longer expires-in',
          );
          // Thirty-two small chunks cross expiry without allocating a large file.
          const intervalMs = Math.ceil(
            (expiresAt.getTime() - Date.now() + 2500) / 31,
          );
          const writing = put(url, {
            bytes: 32 * 65536,
            chunkBytes: 65536,
            intervalMs,
            timeoutMs: report.expiresIn * 1000 + 60_000,
          });
          let duringWrite;
          try {
            await delay(1000);
            duringWrite = await remove(client, config, key);
          } finally {
            // A cleanup failure must not leave the controlled writer running in the background.
            await writing;
          }
          const late = await writing;
          const head = await observe(client, config, key);
          assert.ok(
            Date.parse(late.startedAt) < expiresAt.getTime(),
            JSON.stringify(late),
          );
          assert.ok(
            Date.parse(late.finishedAt) > expiresAt.getTime(),
            JSON.stringify(late),
          );
          assert.equal(late.outcome, 'response', JSON.stringify(late));
          assert.equal(late.bytesSent, 32 * 65536, JSON.stringify(late));
          assert.ok(
            late.bodyFinishedAt &&
              Date.parse(late.bodyFinishedAt) > expiresAt.getTime(),
            JSON.stringify(late),
          );
          // Acceptance/rejection are observations, not a provider-independent success assumption.
          return {
            late,
            duringWrite,
            expiresAt: expiresAt.toISOString(),
            startsBeforeExpiry:
              Date.parse(late.startedAt) < expiresAt.getTime(),
            bodyFinishesAfterExpiry:
              Date.parse(late.bodyFinishedAt) > expiresAt.getTime(),
            head,
            referenceRetained: true,
          };
        },
      );
      await delay(Math.max(0, expiresAt.getTime() - Date.now() + 1500));
      await checkpoint(
        report,
        save,
        `${role}:new-request-after-expiry`,
        async () => {
          const expired = await put(url, fast);
          assert.equal(expired.status, 403, JSON.stringify(expired));
          return {
            expired,
            cleanup: await remove(client, config, key),
            referenceRetained: true,
          };
        },
      );
    }
    await checkpoint(
      report,
      save,
      'server-write-and-conditional-copy',
      async () => {
        const stored = await client.send(
          new PutObjectCommand({
            ...input(keys.source),
            Body: Buffer.alloc(65536, 7),
          }),
        );
        const source = await observe(client, config, keys.source);
        assert.ok(source.etag);
        const copied = await client.send(
          new CopyObjectCommand({
            ...input(keys.copy),
            CopySource: `${bucket}/${keys.source}`,
            CopySourceIfMatch: source.etag,
          }),
        );
        assert.ok(copied.CopyObjectResult?.ETag);
        const head = await observe(client, config, keys.copy);
        assert.equal(head.bytes, 65536);
        return {
          stored: stored.$metadata,
          copied,
          head,
          limitation:
            'Acknowledged operations only; lost response/process death still lacks a remote settlement barrier.',
        };
      },
    );
    const space = Number(process.env.EGO_TASK_SPACE);
    if (space) {
      // Reuse EV-STORAGE-01's real browser CORS/upload/download probe, with its 900s signature.
      report.putValidUntil = new Date(Date.now() + 900_000).toISOString();
      await save();
      await checkpoint(report, save, 'real-browser-cors-probe', async () =>
        browserProbe(
          space,
          directory,
        )(await signProbe(client, bucket, keys.probe)),
      );
    } else {
      report.checks.push({
        name: 'real-browser-cors-probe',
        status: 'incomplete',
        evidence:
          'EGO_TASK_SPACE not supplied; HTTP probe observations are not browser CORS evidence.',
      });
    }
    report.checks.push({
      name: 'lost-server-response-and-process-death',
      status: 'incomplete',
      evidence:
        'Requires real in-flight remote write/crash experiment and a provider settlement contract; resume cleanup alone does not establish either.',
    });
  } catch (error) {
    report.status = 'failed';
    report.checks.push({
      name: 'service-run',
      status: 'failed',
      evidence: errorEvidence(error),
    });
  } finally {
    try {
      await cleanup(
        client,
        config,
        report,
        save,
        'end-of-run-cleanup-observation',
      );
    } finally {
      client.destroy();
    }
  }
}
