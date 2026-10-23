import { randomUUID } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createRestoreRuntime } from '../../../src/server/backup/restore-runtime.ts';
import {
  beginSetupRequest,
  createSetupState,
} from '../../../src/server/identity/setup.ts';
import { runBackupWorker } from '../../../src/server/backup/worker.ts';
import {
  createBackupDataFixture,
  fixtureApplication,
  fixtureKey,
} from './data-fixture.ts';
import { writeJobState } from '../../../src/server/backup/jobs.ts';

const cleanupFailure = vi.hoisted(() => ({ path: '' }));
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rm: (
      path: Parameters<typeof actual.rm>[0],
      options: Parameters<typeof actual.rm>[1],
    ) => {
      if (String(path) === cleanupFailure.path)
        return Promise.reject(
          Object.assign(new Error('fixture cleanup denied'), {
            code: 'EACCES',
          }),
        );
      return actual.rm(path, options);
    },
  };
});

let archiveRoot: string;
let archive: Buffer;
let root: string;
let fixture: ReturnType<typeof createBackupDataFixture>;
let service: ReturnType<typeof createRestoreRuntime>;
let setup: ReturnType<typeof createSetupState>;
const workerFile = new URL(
  '../../../src/cli/backup-worker.ts',
  import.meta.url,
);
const password = 'restore runtime fixture password';
beforeAll(async () => {
  archiveRoot = await mkdtemp(join(tmpdir(), 'ariso-restore-source-'));
  const source = createBackupDataFixture(join(archiveRoot, 'source'));
  source.addImage('saved', 'bytes from old server');
  const jobDirectory = join(archiveRoot, 'job');
  await mkdir(jobDirectory);
  try {
    await runBackupWorker(
      {
        kind: 'backup',
        dataDir: join(archiveRoot, 'source'),
        jobDirectory,
        fileName: 'fixture.zip.age',
        application: fixtureApplication,
        encryptionKey: fixtureKey,
        password,
      },
      { workerFile },
    );
    archive = await readFile(join(jobDirectory, 'fixture.zip.age'));
  } finally {
    source.close();
  }
  await rm(join(archiveRoot, 'source'), { recursive: true });
}, 15000);
afterAll(async () => {
  await rm(archiveRoot, { recursive: true, force: true });
});
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ariso-restore-runtime-'));
  fixture = createBackupDataFixture(root, false);
  setup = createSetupState(fixture.db, fixture.paths.database);
  service = start();
});
afterEach(async () => {
  cleanupFailure.path = '';
  await service.stop();
  fixture.close();
  await rm(root, { recursive: true, force: true });
});
function start() {
  return createRestoreRuntime({
    db: fixture.db,
    dataDir: root,
    encryptionKey: Buffer.alloc(32, 19),
    application: fixtureApplication,
    setup,
    workerFile,
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  });
}
async function upload(id: string) {
  await service.receive(
    id,
    new Request('http://localhost/file', {
      method: 'PUT',
      body: new Uint8Array(archive),
    }),
    0,
    archive.length,
  );
}
async function reach(id: string, status: string) {
  await vi.waitFor(
    () => {
      const job = service.read(id);
      expect(job.status, JSON.stringify(job.failure)).toBe(status);
    },
    { timeout: 15000, interval: 50 },
  );
}

describe('authorized empty-instance restore lifecycle', () => {
  it('preserves the initialization reservation through upload, inspection, configuration and ready', async () => {
    expect(() => service.authorize('wrong')).toThrowError(/初始化码/);
    service.authorize(setup.code!);
    const id = randomUUID();
    expect(service.create(id, archive.length).status).toBe('receiving');
    expect(() => beginSetupRequest(setup)).toThrowError(/恢复/);
    expect(() => service.create(randomUUID(), archive.length)).toThrow();
    await upload(id);
    expect(service.read(id).status).toBe('received');
    service.decrypt(id, password);
    await reach(id, 'configuring');
    expect(service.read(id).summary?.images).toBe(1);
    await service.configure(id, 'https://new.example.test');
    await service.execute(id);
    await reach(id, 'ready');
    expect(setup.restoreJobId).toBe(id);
    expect(() => beginSetupRequest(setup)).toThrow();
    expect(
      await readFile(join(root, 'restore', id, 'state.json'), 'utf8'),
    ).not.toContain(password);
  }, 30000);

  it('keeps the received ciphertext for a corrected password and releases setup after cancel', async () => {
    const id = randomUUID();
    service.create(id, archive.length);
    await upload(id);
    service.decrypt(id, 'wrong password');
    await reach(id, 'failed');
    expect(service.read(id).failedPhase).toBe('decrypting');
    service.decrypt(id, password);
    await reach(id, 'configuring');
    expect((await service.cancel(id)).status).toBe('cancelled');
    expect(service.current().job).toBeNull();
    const release = beginSetupRequest(setup);
    release();
  }, 30000);

  it('requires the new startup code and a reset after an incomplete upload is interrupted', async () => {
    const oldCode = setup.code!;
    const id = randomUUID();
    service.create(id, archive.length);
    await service.stop();
    setup = createSetupState(fixture.db, fixture.paths.database);
    service = start();
    expect(() => service.authorize(oldCode)).toThrow();
    service.authorize(setup.code!);
    expect(service.current().job?.status).toBe('interrupted');
    await expect(upload(id)).rejects.toMatchObject({ status: 409 });
    await service.reset(id);
    await upload(id);
    expect(service.read(id).status).toBe('received');
  });

  it('does not allow restore to claim an in-flight normal setup', () => {
    const release = beginSetupRequest(setup);
    expect(() => service.create(randomUUID(), archive.length)).toThrowError(
      /初始化/,
    );
    release();
    expect(service.create(randomUUID(), archive.length).status).toBe(
      'receiving',
    );
  });

  it('retains failed cancellation cleanup for an explicit retry', async () => {
    const id = randomUUID();
    service.create(id, archive.length);
    const leftover = join(root, 'restore', id, 'content.zip');
    await writeFile(leftover, 'private temporary bytes');
    cleanupFailure.path = leftover;
    await expect(service.cancel(id)).rejects.toBeInstanceOf(Error);
    expect(service.current().job?.cleanupPending).toBe(true);
    expect(service.current().job?.failure?.code).toBe('RESTORE_CLEANUP_FAILED');
    expect(setup.restoreJobId).toBe(id);
    expect((await stat(leftover)).size).toBeGreaterThan(0);
    cleanupFailure.path = '';
    const cancelled = await service.cancel(id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cleanupPending).not.toBe(true);
    expect(service.current().job).toBeNull();
    expect(setup.restoreJobId).toBeNull();
    await expect(stat(leftover)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rebuilds pending cancellation cleanup after a process interruption', async () => {
    const id = randomUUID();
    service.create(id, archive.length);
    const record = service.read(id);
    await service.stop();
    const leftover = join(root, 'restore', id, 'source.zip.age.part');
    await writeFile(leftover, 'unfinished transfer');
    writeJobState(join(root, 'restore', id), {
      ...record,
      status: 'cancelled',
      cleanupPending: true,
    });
    setup = createSetupState(fixture.db, fixture.paths.database);
    service = start();
    expect(service.current().job?.cleanupPending).toBe(true);
    expect(() => beginSetupRequest(setup)).toThrow();
    await service.cancel(id);
    expect(service.current().job).toBeNull();
    await expect(stat(leftover)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
