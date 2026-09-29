import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from '../storage-s3/config.ts';
import { createClient, errorEvidence } from '../storage-s3/protocol.ts';
import { put } from '../upload-late-put/transport.ts';
import {
  deleteSampleObject,
  inspectSampleObject,
  listSampleObjects,
} from './remote.ts';
import {
  aggregateUsage,
  createExperimentResponsibilityTable,
  readExperimentObjects,
  recordExperimentObject,
  type UsageObject,
} from './usage.ts';

type Target = Pick<
  StorageConfig,
  | 'service'
  | 'endpoint'
  | 'region'
  | 'bucket'
  | 'forcePathStyle'
  | 'credentials'
>;

/** Real remote bytes, experimental responsibility records; no production scanner. */
export async function runUsageService(config: Target, directory: string) {
  await mkdir(directory, { recursive: true });
  const storageId = `analytics-143-${randomUUID()}`;
  const prefix = `ariso/${storageId}/`;
  const keys = ['original.bin', 'temporary.bin', 'probe.bin', 'late.bin'].map(
    (name) => prefix + name,
  );
  const sqlite = new Database(join(directory, 'usage.sqlite'));
  const client = createClient(config);
  const attemptedKeys: string[] = [];
  const report = {
    service: config.service,
    endpoint: config.endpoint,
    bucket: config.bucket,
    startedAt: new Date().toISOString(),
    storageId,
    prefix,
    keys,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    status: 'running',
    boundary:
      'Real S3 protocol with experimental provider records; not production S3 upload or scanner. Registered usage is not a remote real-time total.',
    observations: [] as { name: string; at: string; evidence: unknown }[],
    cleanup: [] as { key: string; result?: unknown; error?: unknown }[],
  };
  const save = () =>
    writeFile(
      join(directory, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  const record = (
    key: string,
    owner: UsageObject['owner'],
    state: UsageObject['state'],
    confirmedBytes: number | null,
    group: UsageObject['group'] = 'pending',
  ) =>
    recordExperimentObject(sqlite, {
      storageId,
      key,
      owner,
      group,
      state,
      confirmedBytes,
      confirmedAt: confirmedBytes === null ? null : Date.now(),
    });
  async function observe(name: string, evidence: unknown = {}) {
    report.observations.push({
      name,
      at: new Date().toISOString(),
      evidence: {
        protocol: evidence,
        records: readExperimentObjects(sqlite),
        usage: aggregateUsage(readExperimentObjects(sqlite)),
      },
    });
    await save();
  }
  function expectUsage(
    knownBytes: number,
    pendingObjects: number,
    original: number,
    pending: number,
  ) {
    const usage = aggregateUsage(readExperimentObjects(sqlite));
    assert.equal(usage.length, 1);
    assert.equal(usage[0].knownBytes, knownBytes);
    assert.equal(usage[0].pendingObjects, pendingObjects);
    assert.deepEqual(usage[0].groups, {
      recycle: 0,
      original,
      derived: 0,
      pending,
    });
  }
  let inFlight: ReturnType<typeof put> | undefined;
  try {
    sqlite.pragma('journal_mode = WAL');
    createExperimentResponsibilityTable(sqlite);
    await save();
    // Unknown in-progress objects cannot use the planned request size as occupancy.
    for (const key of keys.slice(0, 3))
      record(key, key === keys[2] ? 'storage' : 'upload', 'writing', null);
    expectUsage(0, 3, 0, 0);
    await observe('registered-writing-unknown');
    for (const [index, key] of keys.slice(0, 3).entries()) {
      attemptedKeys.push(key);
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: Buffer.alloc((index + 1) * 1024, index),
        }),
      );
      const head = await inspectSampleObject(client, config.bucket, key);
      assert.equal(head.bytes, (index + 1) * 1024);
      record(key, index === 2 ? 'storage' : 'upload', 'stored', head.bytes);
    }
    expectUsage(6144, 0, 0, 6144);
    await observe('upload-and-probe-confirmed');
    sqlite.transaction(() => {
      record(keys[0], 'upload', 'handed_off', 1024);
      record(keys[0], 'media', 'stored', 1024, 'original');
    })();
    expectUsage(6144, 0, 1024, 5120);
    await observe('handoff-retains-temporary-and-excludes-upload-audit');
    await deleteSampleObject(client, config.bucket, keys[1]);
    record(keys[1], 'upload', 'deleted', 2048);
    expectUsage(4096, 0, 1024, 3072);
    await observe('temporary-deleted');

    // A controlled slow PUT is still active when DELETE succeeds. No expiration claim.
    const lateKey = keys[3];
    record(lateKey, 'upload', 'writing', null);
    const signed = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: config.bucket, Key: lateKey }),
      { expiresIn: 900 },
    );
    attemptedKeys.push(lateKey);
    inFlight = put(signed, {
      bytes: 2 * 1024 * 1024,
      chunkBytes: 64 * 1024,
      intervalMs: 200,
      timeoutMs: 30_000,
    });
    await delay(500);
    const absence = await deleteSampleObject(client, config.bucket, lateKey);
    record(lateKey, 'upload', 'deleted', null);
    await observe('delete-confirmed-before-slow-put-finishes', absence);
    const writeResult = await inFlight;
    assert.equal(writeResult.status, 200, JSON.stringify(writeResult));
    const deletedAt = report.observations.find(
      (item) => item.name === 'delete-confirmed-before-slow-put-finishes',
    )!.at;
    assert.ok(
      writeResult.bodyFinishedAt && writeResult.bodyFinishedAt > deletedAt,
      'The controlled PUT must finish sending after deletion was confirmed',
    );
    const lateHead = await inspectSampleObject(client, config.bucket, lateKey);
    assert.equal(lateHead.bytes, 2 * 1024 * 1024);
    expectUsage(4096, 0, 1024, 3072);
    await observe('late-object-not-yet-discovered-by-provider', {
      writeResult,
      lateHead,
    });

    const listed = await listSampleObjects(client, config.bucket, prefix);
    assert.ok(listed.some((item) => item.key === lateKey));
    // Reference enumeration is deliberately this small known experiment set.
    // Production reference rechecks, scheduling and restart recovery belong to #164.
    for (const item of listed) {
      if (item.key === keys[0] || item.key === keys[2]) continue;
      assert.equal(item.key, lateKey);
      record(item.key, 'storage', 'cleanup_pending', item.bytes);
    }
    expectUsage(4096 + 2 * 1024 * 1024, 0, 1024, 3072 + 2 * 1024 * 1024);
    await observe(
      'scan-discovers-orphan-and-preserves-live-references',
      listed,
    );
    await deleteSampleObject(client, config.bucket, lateKey);
    record(lateKey, 'storage', 'deleted', lateHead.bytes);
    expectUsage(4096, 0, 1024, 3072);
    await observe('orphan-deletion-deducts-known-bytes');
    await deleteSampleObject(client, config.bucket, keys[2]);
    record(keys[2], 'storage', 'deleted', 3072);
    expectUsage(1024, 0, 1024, 0);
    await observe('probe-deletion-deducts-known-bytes');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.observations.push({
      name: 'failure',
      at: new Date().toISOString(),
      evidence: errorEvidence(error),
    });
  } finally {
    // Settle the owned writer before deleting the exact keys created by this run.
    if (inFlight) await inFlight;
    for (const key of attemptedKeys) {
      try {
        report.cleanup.push({
          key,
          result: await deleteSampleObject(client, config.bucket, key),
        });
      } catch (error) {
        report.status = 'failed';
        report.cleanup.push({ key, error: errorEvidence(error) });
      }
    }
    client.destroy();
    sqlite.close();
    await save();
  }
  return report;
}
