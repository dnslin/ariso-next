import { mkdtemp, mkdir, copyFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runBackupWorker } from '../../../src/server/backup/worker.ts';
import {
  createBackupDataFixture,
  fixtureApplication,
  fixtureKey,
} from './data-fixture.ts';

let root: string;
const password = 'isolated-worker-backup-password';
const workerFile = new URL(
  '../../../src/cli/backup-worker.ts',
  import.meta.url,
);
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ariso-backup-worker-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('real backup worker lifetime', () => {
  it('creates, decrypts and prepares a local restore after the original site is removed', async () => {
    const dataDir = join(root, 'source');
    const fixture = createBackupDataFixture(dataDir);
    const original = fixture.addImage('saved-image', 'original image bytes');
    const jobDirectory = join(root, 'backup-job');
    await mkdir(jobDirectory);
    const events: unknown[] = [];
    const backup = await runBackupWorker(
      {
        kind: 'backup',
        dataDir,
        jobDirectory,
        fileName: 'test.zip.age',
        application: fixtureApplication,
        encryptionKey: fixtureKey,
        password,
      },
      { workerFile, onEvent: (event) => events.push(event) },
    );
    expect(backup.kind).toBe('backup');
    expect(backup.summary.images).toBe(1);
    expect(JSON.stringify(events)).not.toContain(password);
    expect(JSON.stringify(events)).not.toContain(fixtureKey.toString('hex'));
    fixture.close();
    await rm(dataDir, { recursive: true });

    const restoreDirectory = join(root, 'restore-job');
    await mkdir(restoreDirectory);
    await copyFile(
      join(jobDirectory, 'test.zip.age'),
      join(restoreDirectory, 'source.zip.age'),
    );
    const inspected = await runBackupWorker(
      {
        kind: 'inspect',
        jobDirectory: restoreDirectory,
        application: fixtureApplication,
        password,
      },
      { workerFile },
    );
    expect(inspected.summary.images).toBe(1);
    await runBackupWorker(
      {
        kind: 'restore',
        jobId: 'worker-restore-fixture',
        jobDirectory: restoreDirectory,
        application: fixtureApplication,
        encryptionKey: Buffer.alloc(32, 19),
        publicUrl: 'https://new.example.test',
      },
      { workerFile },
    );
    expect(
      await readFile(
        join(
          restoreDirectory,
          'ready/storage',
          fixture.storage.localPath,
          'ariso',
          fixture.storage.id,
          original.key,
        ),
        'utf8',
      ),
    ).toBe('original image bytes');
  }, 30000);

  it('rejects cancellation only after the child has exited', async () => {
    const dataDir = join(root, 'source');
    const fixture = createBackupDataFixture(dataDir);
    fixture.addImage('saved-image', 'original');
    const jobDirectory = join(root, 'backup-job');
    await mkdir(jobDirectory);
    const controller = new AbortController();
    const result = runBackupWorker(
      {
        kind: 'backup',
        dataDir,
        jobDirectory,
        fileName: 'cancelled.zip.age',
        application: fixtureApplication,
        encryptionKey: fixtureKey,
        password,
      },
      {
        workerFile,
        signal: controller.signal,
        onEvent: () => controller.abort(new Error('fixture cancelled')),
      },
    );
    await expect(result).rejects.toThrow('fixture cancelled');
    // This recursive removal can complete after the helper resolves: no worker remains to publish files later.
    await rm(jobDirectory, { recursive: true });
    fixture.close();
  }, 15000);
});
