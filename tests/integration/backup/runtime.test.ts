import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackupRuntime } from '../../../src/server/backup/runtime.ts';
import { createContentMutations } from '../../../src/server/runtime/content-mutations.ts';
import {
  createBackupDataFixture,
  fixtureApplication,
  fixtureKey,
} from './data-fixture.ts';
import { writeJobState } from '../../../src/server/backup/jobs.ts';
import type { BackupJob } from '../../../src/server/backup/types.ts';

let root: string;
let fixture: ReturnType<typeof createBackupDataFixture>;
let service: ReturnType<typeof createBackupRuntime>;
const gate = () => createContentMutations();
let mutations: ReturnType<typeof gate>;
const workerFile = new URL(
  '../../../src/cli/backup-worker.ts',
  import.meta.url,
);
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ariso-backup-runtime-'));
  fixture = createBackupDataFixture(root);
  fixture.addImage('live-image', 'retained local file');
  mutations = gate();
});
afterEach(async () => {
  await service?.stop();
  fixture.close();
  await rm(root, { recursive: true, force: true });
});
function start(
  application: typeof fixtureApplication | null = fixtureApplication,
) {
  service = createBackupRuntime({
    db: fixture.db,
    dataDir: root,
    encryptionKey: fixtureKey,
    application,
    workerFile,
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    contentMutations: mutations,
    quiescence: {
      async acquire(signal?: AbortSignal) {
        mutations.closeAdmission();
        try {
          await mutations.waitForIdle(signal);
        } catch (error) {
          mutations.openAdmission();
          throw error;
        }
        return () => mutations.openAdmission();
      },
    },
  });
  return service;
}
async function settled(id: string) {
  await vi.waitFor(
    async () => {
      const job = await service.read(id);
      expect(['ready', 'failed', 'cancelled']).toContain(job.status);
    },
    { timeout: 15000, interval: 50 },
  );
  return service.read(id);
}

describe('local backup task and download lifecycle', () => {
  it('publishes a real downloadable archive, resumes changes, and protects active downloads from deletion', async () => {
    start();
    const id = randomUUID();
    expect((await service.create(id, 'backup password')).status).toBe(
      'preparing',
    );
    await expect(
      service.create(randomUUID(), 'other password'),
    ).rejects.toMatchObject({ status: 409 });
    await expect(service.create(id, 'new password')).rejects.toMatchObject({
      status: 409,
    });
    const job = await settled(id);
    expect(job.status, JSON.stringify(job.failure)).toBe('ready');
    expect(job.summary?.images).toBe(1);
    expect(job.fileBytes).toBeGreaterThan(0);
    expect(mutations.paused).toBe(false);
    expect(
      await readFile(join(root, 'backups', id, 'state.json'), 'utf8'),
    ).not.toContain('backup password');
    const file = await service.download(id);
    await expect(service.remove(id)).rejects.toMatchObject({
      code: 'BACKUP_DOWNLOAD_ACTIVE',
    });
    const chunks: Buffer[] = [];
    for await (const chunk of file.stream) chunks.push(chunk);
    expect(Buffer.concat(chunks).subarray(0, 22).toString()).toBe(
      'age-encryption.org/v1\n',
    );
    await service.remove(id);
    await expect(service.read(id)).rejects.toMatchObject({ status: 404 });
  }, 20000);

  it('cancels preparation without cancelling an already-admitted mutation', async () => {
    start();
    let finish!: () => void;
    const mutation = mutations.run(
      'existing-upload',
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const id = randomUUID();
    await service.create(id, 'backup password');
    await vi.waitFor(() => expect(mutations.paused).toBe(true));
    await service.cancel(id);
    expect((await service.read(id)).status).toBe('cancelled');
    expect((await service.cancel(id)).status).toBe('cancelled');
    expect(mutations.activeCount).toBe(1);
    expect(mutations.paused).toBe(false);
    finish();
    await mutation;
  });

  it('does not re-freeze the site for an interrupted record after restart', async () => {
    const state: BackupJob = {
      kind: 'backup',
      id: randomUUID(),
      createdAt: 1,
      updatedAt: 1,
      status: 'copying',
    };
    writeJobState(join(root, 'backups', state.id), state);
    start();
    expect((await service.read(state.id)).status).toBe('interrupted');
    expect(mutations.paused).toBe(false);
  });

  it('reserves the download before asynchronous file opening so deletion cannot overtake it', async () => {
    const id = randomUUID();
    writeJobState(join(root, 'backups', id), {
      kind: 'backup',
      id,
      createdAt: 1,
      updatedAt: 1,
      status: 'ready',
      fileName: 'saved.zip.age',
    });
    await writeFile(
      join(root, 'backups', id, 'saved.zip.age'),
      'saved encrypted bytes',
    );
    start();
    let downloadError: unknown;
    const opening = service.download(id).then((file) => {
      file.stream.on('error', (error) => {
        downloadError = error;
      });
      file.stream.resume();
      return file;
    });
    const [download, removal] = await Promise.allSettled([
      opening,
      service.remove(id),
    ]);
    if (download.status === 'fulfilled') download.value.stream.destroy();
    expect(removal.status).toBe('rejected');
    if (removal.status === 'rejected')
      expect(removal.reason).toMatchObject({ code: 'BACKUP_DOWNLOAD_ACTIVE' });
    expect(download.status).toBe('fulfilled');
    expect(downloadError).toBeUndefined();
  });

  it('refuses an unlabelled build before pausing or starting a worker', async () => {
    start(null);
    await expect(
      service.create(randomUUID(), 'backup password'),
    ).rejects.toMatchObject({ code: 'BACKUP_BUILD_UNAVAILABLE' });
    expect(mutations.paused).toBe(false);
  });

  it('records an I/O failure and resumes content mutations', async () => {
    const missing = fixture.addImage('missing', 'must be included');
    await rm(missing.path);
    start();
    const id = randomUUID();
    await service.create(id, 'backup password');
    const job = await settled(id);
    expect(job.status).toBe('failed');
    expect(job.failure?.code).toBe('BACKUP_OBJECT_MISSING');
    expect(mutations.paused).toBe(false);
    await service.remove(id);
  }, 15000);
});
