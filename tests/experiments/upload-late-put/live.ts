import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { configSchema } from '../storage-s3/config.ts';
import { browserProbe } from '../storage-s3/browser.ts';
import {
  createClient,
  errorEvidence,
  signProbe,
  signatureEvidence,
  svg,
} from '../storage-s3/protocol.ts';
import { put } from './transport.ts';

// This experiment tests write timing, not bucket privacy or object-lock configuration.
const fields = configSchema.shape;
const targetSchema = z.object({
  service: fields.service,
  endpoint: fields.endpoint,
  region: fields.region,
  bucket: fields.bucket,
  forcePathStyle: fields.forcePathStyle,
  credentials: fields.credentials,
});
type Target = z.infer<typeof targetSchema>;
type Report = {
  service: string;
  endpoint: string;
  bucket: string;
  startedAt: string;
  expiresIn: number;
  environment: { node: string; platform: string; arch: string };
  keys: string[];
  status: 'running' | 'observed' | 'failed';
  releasePermitted: false;
  observations: {
    name: string;
    at: string;
    result?: unknown;
    error?: unknown;
  }[];
};

export async function runLive(
  config: Target,
  directory: string,
  expiresIn: number,
  browserSpace?: number,
) {
  const client = createClient(config);
  const prefix = `ariso/upload-v01/live-${randomUUID()}`;
  const keys = ['browser.svg', 'upload.bin', 'probe.bin'].map(
    (suffix) => `${prefix}/${suffix}`,
  );
  const report: Report = {
    service: config.service,
    endpoint: config.endpoint,
    bucket: config.bucket,
    startedAt: new Date().toISOString(),
    expiresIn,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    keys,
    status: 'running',
    releasePermitted: false,
    observations: [],
  };
  await mkdir(directory, { recursive: true });
  let pendingSave = Promise.resolve();
  const save = () => {
    pendingSave = pendingSave.then(async () => {
      await writeFile(
        `${directory}/report.json.tmp`,
        JSON.stringify(report, null, 2) + '\n',
      );
      await rename(`${directory}/report.json.tmp`, `${directory}/report.json`);
    });
    return pendingSave;
  };
  await save();
  const record = async (name: string, action: () => Promise<unknown>) => {
    try {
      const result = await action();
      report.observations.push({ name, at: new Date().toISOString(), result });
      return result;
    } catch (error) {
      report.observations.push({
        name,
        at: new Date().toISOString(),
        error: errorEvidence(error),
      });
      report.status = 'failed';
      throw error;
    } finally {
      await save();
      console.log(`${config.service}: ${name}`);
    }
  };
  const input = (Key: string) => ({ Bucket: config.bucket, Key });
  const head = async (key: string) => {
    try {
      const value = await client.send(new HeadObjectCommand(input(key)));
      return {
        exists: true,
        bytes: value.ContentLength,
        etag: value.ETag,
        metadata: value.$metadata,
      };
    } catch (error) {
      const value = errorEvidence(error);
      if (value.httpStatusCode !== 404) throw error;
      return { exists: false, error: value };
    }
  };
  const remove = async (key: string) => {
    const removed = await client.send(new DeleteObjectCommand(input(key)));
    const observed = await head(key);
    assert.equal(observed.exists, false);
    return {
      deletedAt: new Date().toISOString(),
      metadata: removed.$metadata,
      head: observed,
    };
  };
  const content = async (key: string, expected: Buffer) => {
    const read = await client.send(new GetObjectCommand(input(key)));
    const actual = Buffer.from(await read.Body!.transformToByteArray());
    const hash = (value: Buffer) =>
      createHash('sha256').update(value).digest('hex');
    assert.equal(actual.length, expected.length);
    assert.equal(hash(actual), hash(expected));
    return {
      bytes: actual.length,
      sha256: hash(actual),
      metadata: read.$metadata,
    };
  };
  const settleDelay = () => delay(config.service === 'r2' ? 1100 : 0);
  try {
    if (browserSpace) {
      await record('browser-signature-issued', async () => ({
        key: keys[0],
        validUntilNoLaterThan: new Date(Date.now() + 901000).toISOString(),
      }));
      await record('real-browser-put-and-download', async () => {
        const browser = await browserProbe(
          browserSpace,
          directory,
        )(await signProbe(client, config.bucket, keys[0]));
        return { browser, content: await content(keys[0], Buffer.from(svg)) };
      });
    }
    // Two independent keys share the same real 900-second observation window.
    const signed = [];
    for (const key of keys.slice(1)) {
      const signingDate = new Date();
      const expiresAt =
        Math.floor(signingDate.getTime() / 1000) * 1000 + expiresIn * 1000;
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({
          ...input(key),
          ContentType: 'application/octet-stream',
        }),
        { signingDate, expiresIn, signableHeaders: new Set(['content-type']) },
      );
      await record(`signature:${key}`, async () => ({
        key,
        expiresAt: new Date(expiresAt).toISOString(),
        signature: signatureEvidence(url),
      }));
      signed.push({ key, url, expiresAt });
    }
    for (const { key, url } of signed) {
      await record(`replay-after-delete:${key}`, async () => {
        const options = {
          bytes: 65536,
          chunkBytes: 65536,
          intervalMs: 0,
          timeoutMs: 30000,
        };
        const first = await put(url, options);
        assert.equal(first.status, 200, JSON.stringify(first));
        await settleDelay();
        const removed = await remove(key);
        await settleDelay();
        const replay = await put(url, options);
        assert.equal(replay.status, 200, JSON.stringify(replay));
        return {
          first,
          removed,
          replay,
          content: await content(key, Buffer.alloc(65536, 0x61)),
        };
      });
      await settleDelay();
      await record(`cancel-mid-body:${key}`, async () => {
        const cancelled = await put(url, {
          bytes: 1048576,
          chunkBytes: 65536,
          intervalMs: 200,
          abortAfterBytes: 131072,
          timeoutMs: 30000,
        });
        assert.equal(cancelled.outcome, 'aborted', JSON.stringify(cancelled));
        await settleDelay();
        return {
          cancelled,
          removed: await remove(key),
          releasePermitted: false,
        };
      });
    }
    const writes = await Promise.allSettled(
      signed.map(async ({ key, url, expiresAt }) => {
        // Expiry is not backdated. Wait until near the actual end of this 900s URL.
        const startsAt = expiresAt - 10000;
        assert.ok(
          Date.now() < startsAt,
          'Preparation consumed the window; use a longer expires-in',
        );
        while (Date.now() < startsAt)
          await delay(Math.min(30000, startsAt - Date.now()));
        await record(`late-put:${key}`, async () => {
          const writer = put(url, {
            bytes: 32 * 65536,
            chunkBytes: 65536,
            intervalMs: 650,
            timeoutMs: 60000,
          });
          let during;
          let deletionError;
          try {
            await delay(2500);
            during = await remove(key);
          } catch (error) {
            deletionError = errorEvidence(error);
            report.status = 'failed';
          }
          const result = await writer;
          const observed = await head(key);
          // Preserve rejection and transport failures as observations, not fabricated success.
          const crossed = Boolean(
            result.bodyFinishedAt &&
            Date.parse(result.startedAt) < expiresAt &&
            Date.parse(result.bodyFinishedAt) > expiresAt &&
            result.bytesSent === 32 * 65536,
          );
          const payload =
            result.status === 200
              ? await content(key, Buffer.alloc(32 * 65536, 0x61))
              : undefined;
          return {
            expiresAt: new Date(expiresAt).toISOString(),
            during,
            deletionError,
            result,
            crossed,
            head: observed,
            content: payload,
            releasePermitted: false,
          };
        });
        await record(`expired-url:${key}`, async () => {
          await delay(Math.max(0, expiresAt + 1500 - Date.now()));
          const result = await put(url, {
            bytes: 65536,
            chunkBytes: 65536,
            intervalMs: 0,
            timeoutMs: 30000,
          });
          assert.equal(result.status, 403, JSON.stringify(result));
          return result;
        });
      }),
    );
    const rejected = writes.find((result) => result.status === 'rejected');
    if (rejected?.status === 'rejected') throw rejected.reason;
    if (report.status !== 'failed') report.status = 'observed';
  } catch (error) {
    report.status = 'failed';
    report.observations.push({
      name: 'run-failed',
      at: new Date().toISOString(),
      error: errorEvidence(error),
    });
  } finally {
    for (const key of keys) {
      try {
        await settleDelay();
        await record(`controlled-experiment-cleanup:${key}`, () => remove(key));
      } catch {
        report.status = 'failed';
      }
    }
    try {
      await save();
    } finally {
      client.destroy();
    }
  }
  return report;
}

if (import.meta.main) {
  assert.equal(process.versions.node.split('.')[0], '24');
  const { values } = parseArgs({
    options: {
      config: { type: 'string' },
      output: { type: 'string', default: 'test-results/upload-v01-live' },
      'expires-in': { type: 'string', default: '900' },
      service: { type: 'string' },
      browser: { type: 'boolean', default: false },
    },
  });
  assert.ok(values.config);
  const expiresIn = Number(values['expires-in']);
  assert.ok(Number.isInteger(expiresIn) && expiresIn >= 30 && expiresIn <= 900);
  const targets = targetSchema
    .array()
    .parse(JSON.parse(await readFile(values.config, 'utf8')))
    .filter((target) => !values.service || target.service === values.service);
  assert.ok(targets.length > 0);
  assert.equal(
    new Set(targets.map((target) => target.service)).size,
    targets.length,
  );
  const root = resolve(values.output);
  await mkdir(root, { recursive: true });
  const output = await mkdtemp(`${root}/run-`);
  console.log(output);
  // Each invocation selects one service when using the shared browser's fixed port.
  if (values.browser)
    assert.equal(
      targets.length,
      1,
      'Run browser services sequentially to reuse the fixed origin',
    );
  for (const target of targets) {
    const report = await runLive(
      target,
      `${output}/${target.service}`,
      expiresIn,
      values.browser ? Number(process.env.EGO_TASK_SPACE) : undefined,
    );
    if (report.status === 'failed') process.exitCode = 1;
  }
}
