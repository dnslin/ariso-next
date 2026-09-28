import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from '../storage-s3/config.ts';
import { errorEvidence } from '../storage-s3/protocol.ts';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';

type Target = Pick<
  StorageConfig,
  | 'service'
  | 'endpoint'
  | 'region'
  | 'bucket'
  | 'forcePathStyle'
  | 'credentials'
>;
const script = fileURLToPath(import.meta.url);
const sha256 = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
function clientFor(config: Target) {
  return new S3Client({
    ...config,
    maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: {
      connectionTimeout: 10_000,
      requestTimeout: 30_000,
      throwOnRequestTimeout: true,
    },
  });
}
async function exists(client: S3Client, config: Target, key: string) {
  try {
    await client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    return true;
  } catch (error) {
    if (errorEvidence(error).httpStatusCode === 404) return false;
    throw error;
  }
}
function child(mode: string, input: unknown) {
  const process = spawn(globalThis.process.execPath, [script, mode], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  process.stdout.on('data', (data) => {
    output += data;
  });
  process.stderr.on('data', (data) => {
    errors += data;
  });
  const done = once(process, 'close').then(([code, signal]) => ({
    code,
    signal,
    output,
    errors,
  }));
  process.stdin.end(JSON.stringify(input));
  return { process, done };
}
async function readyChild(result: ReturnType<typeof child>) {
  await Promise.race([
    once(result.process.stdout, 'data', {
      signal: AbortSignal.timeout(10_000),
    }),
    result.done.then((exit) => {
      throw new Error(`Child exited before ready: ${exit.code} ${exit.errors}`);
    }),
  ]);
}
async function successfulChild(result: ReturnType<typeof child>) {
  const exit = await result.done;
  assert.equal(exit.code, 0, exit.errors);
  return JSON.parse(exit.output);
}

export async function runFaults(
  config: Target,
  directory: string,
  intervalMs = 500,
) {
  await mkdir(directory, { recursive: true });
  const prefix = `ariso/upload-v01/faults/${randomUUID()}`;
  const keys = ['put.bin', 'copy.bin', 'restart.bin'].map(
    (name) => `${prefix}/${name}`,
  );
  const report = {
    service: config.service,
    endpoint: config.endpoint,
    bucket: config.bucket,
    startedAt: new Date().toISOString(),
    keys,
    scope:
      'Controlled fault experiment only; private bucket and lock policy are not asserted.',
    productionReleasePermitted: false,
    lostResponses: [] as Array<{
      operation: string;
      provider: { status: number; requestId?: string; receivedAt: string };
      clientError: ReturnType<typeof errorEvidence>;
      expectedSha256: string;
      actualSha256: string;
    }>,
    recovery: {} as Record<string, unknown>,
    cleanup: [] as Array<{ key: string; absent: boolean }>,
    failure: undefined as ReturnType<typeof errorEvidence> | undefined,
  };
  const save = () =>
    writeFile(
      join(directory, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  // Record exact keys before any remote mutation.
  await save();
  const client = clientFor(config);
  let writer: ReturnType<typeof child> | undefined;
  let owner: ReturnType<typeof child> | undefined;
  try {
    const body = Buffer.alloc(65536, 0x61);
    for (const [index, operation] of ['PUT', 'Copy'].entries()) {
      const lossy = clientFor(config);
      const handler = lossy.config.requestHandler;
      const originalHandle = handler.handle.bind(handler);
      let provider:
        { status: number; requestId?: string; receivedAt: string } | undefined;
      handler.handle = async (...args: Parameters<typeof originalHandle>) => {
        const result = await originalHandle(...args);
        provider = {
          status: result.response.statusCode,
          requestId: result.response.headers['x-amz-request-id'],
          receivedAt: new Date().toISOString(),
        };
        // Drain the real response, but never deliver it to SDK deserialization.
        for await (const chunk of result.response.body) void chunk;
        throw Object.assign(
          new Error(
            'Injected connection loss after actual provider response; SDK did not receive acknowledgement',
          ),
          { name: 'InjectedResponseLoss', code: 'ECONNRESET' },
        );
      };
      let clientError: ReturnType<typeof errorEvidence> | undefined;
      try {
        if (index === 0) {
          await lossy.send(
            new PutObjectCommand({
              Bucket: config.bucket,
              Key: keys[index],
              Body: body,
            }),
          );
        } else {
          await lossy.send(
            new CopyObjectCommand({
              Bucket: config.bucket,
              Key: keys[index],
              CopySource: `/${config.bucket}/${keys[0]}`,
            }),
          );
        }
      } catch (error) {
        clientError = errorEvidence(error);
      } finally {
        lossy.destroy();
      }
      assert.ok(provider && clientError);
      assert.equal(provider.status, 200);
      assert.equal(clientError.name, 'InjectedResponseLoss');
      const remote = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: keys[index] }),
      );
      assert.ok(remote.Body);
      const actualSha256 = sha256(await remote.Body.transformToByteArray());
      report.lostResponses.push({
        operation,
        provider,
        clientError,
        expectedSha256: sha256(body),
        actualSha256,
      });
      await save();
      assert.equal(actualSha256, sha256(body));
    }
    const journal = join(directory, 'responsibility.json');
    owner = child('owner', { journal, key: keys[2] });
    await readyChild(owner);
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: keys[2],
        ContentType: 'application/octet-stream',
      }),
      { expiresIn: 900 },
    );
    writer = child('writer', { url, intervalMs });
    await readyChild(writer);
    // Writer sends its first chunk before signalling; it remains an independent process.
    const killedAt = new Date().toISOString();
    owner.process.kill('SIGKILL');
    const ownerExit = await owner.done;
    const recovered = await successfulChild(
      child('recover', { journal, config }),
    );
    const completed = await successfulChild(writer);
    const afterWriterCompleted = await exists(client, config, keys[2]);
    report.recovery = {
      killedAt,
      ownerSignal: ownerExit.signal,
      ...recovered,
      writer: completed,
      afterWriterCompleted,
      responsibilityRetained:
        JSON.parse(await readFile(journal, 'utf8')).key === keys[2],
    };
    await save();
    assert.ok(Date.parse(completed.firstChunkAt) <= Date.parse(killedAt));
    assert.ok(
      Date.parse(recovered.recoveredAt) < Date.parse(completed.bodyFinishedAt),
    );
    assert.equal(ownerExit.signal, 'SIGKILL');
    assert.equal(recovered.afterEarlyDelete, false);
    assert.equal(completed.status, 200);
    assert.equal(afterWriterCompleted, true);
  } catch (error) {
    report.failure = errorEvidence(error);
    throw error;
  } finally {
    if (
      owner &&
      owner.process.exitCode === null &&
      owner.process.signalCode === null
    )
      owner.process.kill('SIGKILL');
    // All controlled writers settle before final deletion. This does not prove a production settlement barrier.
    if (writer) await writer.done;
    for (const key of keys) {
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        report.cleanup.push({
          key,
          absent: !(await exists(client, config, key)),
        });
      } catch (error) {
        report.cleanup.push({ key, absent: false });
        report.failure ??= errorEvidence(error);
      }
    }
    try {
      await save();
    } finally {
      client.destroy();
    }
  }
  assert.ok(
    report.cleanup.every((entry) => entry.absent),
    'Remote cleanup incomplete: see report exact keys',
  );
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === script) {
  const mode = process.argv[2];
  if (mode === 'run') {
    const configs: Target[] = JSON.parse(
      await readFile(process.argv[3], 'utf8'),
    );
    for (const config of configs) {
      const directory = resolve(process.argv[4], config.service);
      await runFaults(config, directory);
      console.log(
        `${config.service}: controlled fault experiments and cleanup passed; ${directory}`,
      );
    }
  } else {
    let raw = '';
    for await (const chunk of process.stdin) raw += chunk;
    const input = JSON.parse(raw);
    if (mode === 'owner') {
      await writeFile(
        input.journal,
        JSON.stringify({ key: input.key, responsibilityRetained: true }),
      );
      process.stdout.write('ready\n');
      setInterval(() => {}, 1000);
    } else if (mode === 'writer') {
      const startedAt = new Date().toISOString();
      const url = new URL(input.url);
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
        url,
        {
          method: 'PUT',
          headers: {
            'content-type': 'application/octet-stream',
            'content-length': 32 * 65536,
          },
        },
      );
      const response = new Promise<{
        status: number | undefined;
        finishedAt: string;
      }>((resolve, reject) => {
        request.on('error', reject);
        request.on('response', (incoming) => {
          incoming.resume();
          incoming.on('error', reject);
          incoming.on('end', () =>
            resolve({
              status: incoming.statusCode,
              finishedAt: new Date().toISOString(),
            }),
          );
        });
      });
      // Attach rejection immediately, even while the body is still sending.
      void response.catch(() => {});
      const deadline = setTimeout(
        () => request.destroy(new Error('Writer deadline exceeded')),
        60_000,
      );
      let firstChunkAt: string | undefined;
      try {
        for (let index = 0; index < 32; index++) {
          await new Promise<void>((resolve, reject) =>
            request.write(Buffer.alloc(65536, 0x61), (error) =>
              error ? reject(error) : resolve(),
            ),
          );
          if (index === 0) {
            firstChunkAt = new Date().toISOString();
            process.stdout.write(' ');
          }
          if (index < 31) await delay(input.intervalMs);
        }
        await new Promise<void>((resolve, reject) => {
          request.once('error', reject);
          request.end(resolve);
        });
        const bodyFinishedAt = new Date().toISOString();
        console.log(
          JSON.stringify({
            startedAt,
            firstChunkAt,
            bodyFinishedAt,
            ...(await response),
          }),
        );
      } finally {
        clearTimeout(deadline);
        request.destroy();
      }
    } else if (mode === 'recover') {
      const { key } = JSON.parse(await readFile(input.journal, 'utf8'));
      const client = clientFor(input.config);
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: input.config.bucket, Key: key }),
        );
        console.log(
          JSON.stringify({
            key,
            recoveredAt: new Date().toISOString(),
            afterEarlyDelete: await exists(client, input.config, key),
          }),
        );
      } finally {
        client.destroy();
      }
    } else throw new Error('Expected run, owner, writer or recover');
  }
}
