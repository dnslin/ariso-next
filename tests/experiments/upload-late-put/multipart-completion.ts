import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { createClient, errorEvidence } from '../storage-s3/protocol.ts';
import type { MultipartTarget } from './multipart.ts';

const script = fileURLToPath(import.meta.url);
const hash = (body: Uint8Array) =>
  createHash('sha256').update(body).digest('hex');
const body = Buffer.alloc(65536, 0x61);
type Event = {
  name: string;
  dispatchedAt: string;
  settledAt?: string;
  result?: unknown;
  error?: ReturnType<typeof errorEvidence>;
};
type Case = {
  mode: string;
  key: string;
  uploadId?: string;
  expectedSha256: string;
  events: Event[];
  objectAbsent: boolean;
  recovery?: {
    pid: number;
    exists: boolean;
    contentMatches?: boolean;
    actualSha256?: string;
    events: Event[];
  };
};

export async function runCompletion(
  target: MultipartTarget,
  directory: string,
  spacingMs = 1100,
) {
  await mkdir(directory, { recursive: true });
  const report = {
    service: target.service,
    endpoint: target.endpoint,
    bucket: target.bucket,
    startedAt: new Date().toISOString(),
    status: 'failed' as 'failed' | 'observed',
    productionReleasePermitted: false,
    backendPartsReclaimed: 'unverified',
    cases: [] as Case[],
    failures: [] as ReturnType<typeof errorEvidence>[],
  };
  const journal = join(directory, 'report.json');
  const save = async () => {
    await writeFile(`${journal}.tmp`, JSON.stringify(report, null, 2) + '\n', {
      mode: 0o600,
    });
    await rename(`${journal}.tmp`, journal);
  };
  // Serialize journal writes while network operations remain concurrent.
  let saving = Promise.resolve();
  const persist = () => {
    saving = saving.then(save);
    return saving;
  };
  await persist();
  const client = createClient(target);
  try {
    for (const mode of [
      'lost-response',
      'complete-first',
      'abort-first',
      'concurrent-1',
      'concurrent-2',
      'concurrent-3',
    ]) {
      const current: Case = {
        mode,
        key: `ariso/upload-v01/completion/${randomUUID()}`,
        expectedSha256: hash(body),
        events: [],
        objectAbsent: false,
      };
      report.cases.push(current);
      await persist();
      const input = { Bucket: target.bucket, Key: current.key };
      const record = async <T>(
        name: string,
        action: () => Promise<T>,
        expected: string[] = [],
      ) => {
        const event: Event = { name, dispatchedAt: new Date().toISOString() };
        current.events.push(event);
        await persist();
        try {
          const result = await action();
          event.result = result;
          return result;
        } catch (error) {
          event.error = errorEvidence(error);
          if (!expected.includes(event.error.name))
            report.failures.push(event.error);
          return undefined;
        } finally {
          event.settledAt = new Date().toISOString();
          await persist();
        }
      };
      try {
        const created = await record('create', async () => {
          const result = await client.send(
            new CreateMultipartUploadCommand(input),
          );
          current.uploadId = result.UploadId;
          await persist();
          return result;
        });
        assert.ok(created?.UploadId, 'Create must return upload ID');
        const session = { ...input, UploadId: created.UploadId };
        const part = await record('part', () =>
          client.send(
            new UploadPartCommand({ ...session, PartNumber: 1, Body: body }),
          ),
        );
        assert.ok(part?.ETag, 'UploadPart must return ETag');
        const completeInput = {
          ...session,
          MultipartUpload: { Parts: [{ PartNumber: 1, ETag: part.ETag }] },
        };
        const complete = () =>
          record(
            'complete',
            () =>
              client.send(new CompleteMultipartUploadCommand(completeInput)),
            ['NoSuchUpload'],
          );
        const abort = () =>
          record(
            'abort',
            () => client.send(new AbortMultipartUploadCommand(session)),
            ['NoSuchUpload'],
          );
        await delay(spacingMs);
        if (mode === 'lost-response') {
          const lossy = createClient(target);
          const handler = lossy.config.requestHandler;
          const original = handler.handle.bind(handler);
          handler.handle = async (...args: Parameters<typeof original>) => {
            const response = await original(...args);
            let xml = '';
            for await (const chunk of response.response.body)
              xml += chunk.toString();
            current.events.push({
              name: 'provider-complete-response',
              dispatchedAt: new Date().toISOString(),
              result: {
                status: response.response.statusCode,
                requestId: response.response.headers['x-amz-request-id'],
                body: xml,
              },
            });
            await persist();
            assert.equal(response.response.statusCode, 200);
            assert.ok(
              xml.includes('CompleteMultipartUploadResult'),
              'HTTP 200 may contain embedded S3 error',
            );
            throw Object.assign(
              new Error('Injected loss after provider Complete response'),
              { name: 'InjectedResponseLoss' },
            );
          };
          try {
            await record(
              'complete',
              () =>
                lossy.send(new CompleteMultipartUploadCommand(completeInput)),
              ['InjectedResponseLoss'],
            );
          } finally {
            lossy.destroy();
          }
          assert.equal(
            current.events.find((e) => e.name === 'complete')?.error?.name,
            'InjectedResponseLoss',
          );
          const child = spawn(process.execPath, [script, 'recover'], {
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          let stdout = '';
          let stderr = '';
          child.stdout.on('data', (chunk) => (stdout += chunk));
          child.stderr.on('data', (chunk) => (stderr += chunk));
          const done = new Promise<void>((resolve, reject) => {
            child.once('error', reject);
            child.once('close', (code) =>
              code === 0
                ? resolve()
                : reject(new Error(`Recovery child failed ${code}: ${stderr}`)),
            );
          });
          child.stdin.end(
            JSON.stringify({ target, journal, key: current.key }),
          );
          await done;
          current.recovery = JSON.parse(stdout);
          await persist();
          assert.ok(
            current.recovery?.contentMatches,
            'New process must verify committed bytes from journal',
          );
        } else if (mode === 'complete-first') {
          assert.ok(
            await complete(),
            'Complete-first must complete successfully',
          );
          await abort();
        } else if (mode === 'abort-first') {
          assert.ok(await abort(), 'Abort-first must abort successfully');
          await complete();
          assert.equal(
            current.events.find((e) => e.name === 'complete')?.error?.name,
            'NoSuchUpload',
            'Complete after settled Abort must reject',
          );
        } else {
          const settled = await Promise.allSettled([complete(), abort()]);
          for (const result of settled)
            if (result.status === 'rejected') throw result.reason;
        }
        await record(
          'list-after-settled',
          () => client.send(new ListPartsCommand(session)),
          ['NoSuchUpload'],
        );
        const head = await record(
          'head-after-settled',
          () => client.send(new HeadObjectCommand(input)),
          ['NotFound'],
        );
        if (mode === 'complete-first')
          assert.ok(head, 'Completed object must exist');
        if (head)
          await record('get-after-settled', async () => {
            const value = await client.send(new GetObjectCommand(input));
            assert.ok(value.Body);
            const bytes = await value.Body.transformToByteArray();
            assert.equal(hash(bytes), current.expectedSha256);
            return { bytes: bytes.length, sha256: hash(bytes) };
          });
        if (mode === 'abort-first')
          assert.equal(head, undefined, 'Aborted object must remain absent');
      } catch (error) {
        report.failures.push(errorEvidence(error));
        await persist();
      } finally {
        await delay(spacingMs);
        if (current.uploadId)
          await record(
            'cleanup-abort',
            () =>
              client.send(
                new AbortMultipartUploadCommand({
                  ...input,
                  UploadId: current.uploadId,
                }),
              ),
            ['NoSuchUpload'],
          );
        await record('cleanup-delete', () =>
          client.send(new DeleteObjectCommand(input)),
        );
        await record(
          'cleanup-head',
          async () => {
            try {
              return await client.send(new HeadObjectCommand(input));
            } catch (error) {
              if (errorEvidence(error).httpStatusCode === 404)
                current.objectAbsent = true;
              throw error;
            }
          },
          ['NotFound'],
        );
        if (!current.objectAbsent)
          report.failures.push({
            name: 'CleanupIncomplete',
            message: current.key,
          });
        await persist();
      }
    }
    report.status = report.failures.length ? 'failed' : 'observed';
    await persist();
    return report;
  } finally {
    client.destroy();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === script) {
  if (process.argv[2] === 'recover') {
    let raw = '';
    for await (const chunk of process.stdin) raw += chunk;
    const { target, journal, key } = JSON.parse(raw) as {
      target: MultipartTarget;
      journal: string;
      key: string;
    };
    const saved = JSON.parse(await readFile(journal, 'utf8'));
    const item: Case = saved.cases.find((c: Case) => c.key === key);
    assert.ok(item?.uploadId);
    const client = createClient(target);
    const input = { Bucket: saved.bucket, Key: item.key };
    const result: NonNullable<Case['recovery']> = {
      pid: process.pid,
      exists: false,
      events: [],
    };
    try {
      for (const [name, action] of [
        [
          'list',
          () =>
            client.send(
              new ListPartsCommand({ ...input, UploadId: item.uploadId }),
            ),
        ],
        ['head', () => client.send(new HeadObjectCommand(input))],
      ] as const) {
        const event: Event = { name, dispatchedAt: new Date().toISOString() };
        try {
          event.result = await action();
          if (name === 'head') result.exists = true;
        } catch (error) {
          event.error = errorEvidence(error);
          if (event.error.httpStatusCode !== 404) throw error;
        } finally {
          event.settledAt = new Date().toISOString();
          result.events.push(event);
        }
      }
      if (result.exists) {
        const remote = await client.send(new GetObjectCommand(input));
        assert.ok(remote.Body);
        result.actualSha256 = hash(await remote.Body.transformToByteArray());
        result.contentMatches = result.actualSha256 === item.expectedSha256;
      }
      console.log(JSON.stringify(result));
    } finally {
      client.destroy();
    }
  } else if (process.argv[2] === 'run') {
    const targets: MultipartTarget[] = JSON.parse(
      await readFile(process.argv[3], 'utf8'),
    );
    const base = resolve(
      process.argv[4] ?? 'test-results/upload-v01-completion',
      `run-${randomUUID()}`,
    );
    for (const target of targets) {
      const directory = join(base, target.service);
      const result = await runCompletion(target, directory);
      console.log(`${target.service}: ${result.status}; ${directory}`);
      if (result.status === 'failed') process.exitCode = 1;
    }
  } else throw Error('Expected run or recover');
}
