import { spawnSync } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  newLatePutReport,
  saveReport,
} from '../../experiments/upload-late-put/report.ts';

it('a fresh process retains exact-key responsibility after DELETE/HEAD404, including a later reappearance', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'late-put-recovery-'));
  const requests: string[] = [];
  let exists = true;
  let denyDelete = false;
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    if (request.method === 'DELETE') {
      if (denyDelete) {
        response.writeHead(403);
        response.end('<Error><Code>AccessDenied</Code></Error>');
        return;
      }
      exists = false;
      response.writeHead(204);
    } else response.writeHead(exists ? 200 : 404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing local address');
  const config = {
    service: 'seaweedfs' as const,
    endpoint: `http://127.0.0.1:${address.port}`,
    region: 'us-east-1',
    bucket: 'test',
    forcePathStyle: true,
    credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' },
    serviceVersion: 'local HTTP fixture, not SeaweedFS',
    revision: 'fixture',
    ownerConfirmation: {
      revision: 'fixture',
      privateBucketAndNoPublicAliases: true as const,
      evidence: 'local fixture only',
    },
  };
  const path = join(directory, 'report.json');
  const configPath = join(directory, 'config.json');
  const report = newLatePutReport('seaweedfs', 900);
  report.target = {
    endpoint: config.endpoint,
    bucket: config.bucket,
    region: config.region,
    forcePathStyle: true,
    revision: config.revision,
    serviceVersion: config.serviceVersion,
  };
  report.keys = ['ariso/upload-v01/fixture/upload.bin'];
  // The writer died with no response. Expiry and absence do not erase this journal.
  report.putValidUntil = '2000-01-01T00:00:00.000Z';
  await saveReport(path, report);
  await writeFile(configPath, JSON.stringify([config]));
  const args = [
    'tests/experiments/upload-late-put/run.ts',
    '--config',
    configPath,
    '--resume',
    path,
  ];
  const run = async () => {
    try {
      await promisify(execFile)(process.execPath, args, { timeout: 10_000 });
      throw new Error('Must not claim acceptance');
    } catch (error) {
      expect(error).toMatchObject({ code: 1, stderr: '' });
    }
    return JSON.parse(await readFile(path, 'utf8'));
  };
  try {
    const first = await run();
    expect(first).toMatchObject({
      status: 'incomplete',
      keys: report.keys,
      release: { permitted: false },
    });
    expect(first.checks[0]).toMatchObject({
      status: 'passed',
      evidence: { head: { exists: false }, referenceRetained: true },
    });
    exists = true; // Delayed remote write completes after the first cleaner exited.
    denyDelete = true;
    const failed = await run();
    expect(failed).toMatchObject({
      status: 'failed',
      keys: report.keys,
      release: { permitted: false },
    });
    expect(failed.checks[1]).toMatchObject({
      status: 'failed',
      evidence: { httpStatusCode: 403 },
    });
    denyDelete = false;
    const retried = await run();
    expect(retried.keys).toEqual(report.keys);
    expect(retried.checks[2].evidence.head.exists).toBe(false);
    expect(retried.release.permitted).toBe(false);
    expect(
      requests.every(
        (request) =>
          request.split(' ')[1] ===
            '/test/ariso/upload-v01/fixture/upload.bin?x-id=DeleteObject' ||
          request.split(' ')[1] === '/test/ariso/upload-v01/fixture/upload.bin',
      ),
    ).toBe(true);
    // Wrong revision cannot turn an old report into a request against a different location.
    await writeFile(
      configPath,
      JSON.stringify([
        {
          ...config,
          revision: 'changed',
          ownerConfirmation: {
            ...config.ownerConfirmation,
            revision: 'changed',
          },
        },
      ]),
    );
    const before = requests.length;
    const mismatch = spawnSync(process.execPath, args, {
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(mismatch.status).toBe(1);
    expect(mismatch.stderr).toContain('original experiment target');
    expect(requests).toHaveLength(before);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
