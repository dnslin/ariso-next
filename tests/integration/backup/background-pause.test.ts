import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { startWatermarkRuntime } from '../../../src/server/media/watermark-runtime.ts';
import * as assets from '../../../src/server/media/watermark-assets.ts';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { collectionFixture } from '../collections/helpers.ts';
import { startStorageMaintenance } from '../../../src/server/storage/maintenance.ts';
import { startStorageProbeRuntime } from '../../../src/server/storage/probe-runtime.ts';
import { startUploadRuntime } from '../../../src/server/upload/runtime.ts';
import { createPublicReceipt } from '../../../src/server/upload/public-receive.ts';
import * as uploadCleanup from '../../../src/server/upload/cleanup.ts';
import * as probes from '../../../src/server/storage/probes.ts';
import * as scans from '../../../src/server/storage/scans.ts';
import { storageProbes } from '../../../src/server/storage/schema.ts';
import { uploadSessions } from '../../../src/server/upload/schema.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { readStorageReferences } from '../../../src/server/startup/storage-references.ts';
vi.mock('node:timers/promises', async (importOriginal) => {
  const timers = await importOriginal<typeof import('node:timers/promises')>();
  return {
    ...timers,
    setTimeout: (
      _ms: number,
      value: unknown,
      options: Parameters<typeof timers.setTimeout>[2],
    ) => timers.setTimeout(5, value, options),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('persistent background pause', () => {
  it('drains a storage scan and does not start another scan while paused', async () => {
    const fixture = collectionFixture();
    const pending = Promise.withResolvers<void>();
    let rounds = 0;
    const scan = scans.scanStorage;
    vi.spyOn(scans, 'scanStorage').mockImplementation(async (...args) => {
      rounds++;
      if (rounds === 1) await pending.promise;
      return scan(...args);
    });
    const service = startStorageMaintenance({
      ...fixture,
      secretCrypto: createSecretCrypto(Buffer.alloc(32, 1)),
      readReferences: readStorageReferences,
      clearReleasedReferences() {},
      logger: { error() {} },
    });
    try {
      service.pause();
      let idle = false;
      const drained = service.waitForIdle().then(() => {
        idle = true;
      });
      await Promise.resolve();
      expect(idle).toBe(false);
      pending.resolve();
      await drained;
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(rounds).toBe(1);
      service.resume();
      await vi.waitFor(() => expect(rounds).toBeGreaterThan(1));
    } finally {
      pending.resolve();
      await service.stop();
      fixture.close();
    }
  });

  it('drains an upload cleanup and leaves later maintenance paused until release', async () => {
    const fixture = collectionFixture();
    const context = {
      ...fixture,
      temporaryRoot: join(fixture.storageRoot, 'tmp'),
      logger: { error() {}, info() {} },
    };
    const id = createPublicReceipt(context);
    fixture.db
      .update(uploadSessions)
      .set({
        state: 'failed',
        cleanupStatus: 'pending',
        nextCleanupAt: new Date(0),
      })
      .where(eq(uploadSessions.id, id))
      .run();
    const pending = Promise.withResolvers<void>();
    let rounds = 0;
    vi.spyOn(uploadCleanup, 'cleanupSession').mockImplementation(async () => {
      rounds++;
      if (rounds === 1) await pending.promise;
    });
    const service = startUploadRuntime(context);
    try {
      service.pause();
      let idle = false;
      const drained = service.waitForIdle().then(() => {
        idle = true;
      });
      await Promise.resolve();
      expect(idle).toBe(false);
      pending.resolve();
      await drained;
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(rounds).toBe(1);
      service.resume();
      await vi.waitFor(() => expect(rounds).toBeGreaterThan(1));
    } finally {
      pending.resolve();
      await service.stop();
      fixture.close();
    }
  });

  it('drains probe cleanup without starting a new probe-maintenance round', async () => {
    const fixture = collectionFixture();
    const id = randomUUID();
    const now = new Date();
    fixture.db
      .insert(storageProbes)
      .values({
        id,
        storageId: fixture.storage.id,
        purpose: 'connection',
        configRevision: 1,
        key: `probes/${id}`,
        state: 'cleanup',
        stage: 'delete',
        objectState: 'stored',
        nextCleanupAt: new Date(0),
        createdAt: now,
        updatedAt: now,
        report: {
          probeId: id,
          storageId: fixture.storage.id,
          revision: 1,
          passed: false,
          stale: false,
          cleanupPending: true,
          stages: [],
          deploymentRequirement: 'Bucket 必须保持私有',
          testedAt: now.toISOString(),
          ownerConfirmation: {
            wholeBucketHasNoLockRules: false,
            confirmedAt: null,
          },
        },
      })
      .run();
    const pending = Promise.withResolvers<void>();
    let rounds = 0;
    vi.spyOn(probes, 'cleanupProbe').mockImplementation(async () => {
      rounds++;
      if (rounds === 1) await pending.promise;
    });
    const service = startStorageProbeRuntime({
      ...fixture,
      secretCrypto: createSecretCrypto(Buffer.alloc(32, 1)),
      logger: { error() {}, info() {} },
    });
    try {
      service.pause();
      let idle = false;
      const drained = service.waitForIdle().then(() => {
        idle = true;
      });
      await Promise.resolve();
      expect(idle).toBe(false);
      pending.resolve();
      await drained;
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(rounds).toBe(1);
      service.resume();
      await vi.waitFor(() => expect(rounds).toBeGreaterThan(1));
    } finally {
      pending.resolve();
      await service.stop();
      fixture.close();
    }
  });

  it('drains a current watermark cleanup, skips later intervals and resumes without aborting it', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ariso-backup-background-'));
    const connection = openRuntimeDatabase(join(directory, 'ariso.db'));
    migrateRuntimeDatabase(connection.db, resolve('drizzle'));
    const pending = Promise.withResolvers<[]>();
    let cleanupRounds = 0;
    vi.spyOn(assets, 'cleanupWatermarkAssets').mockImplementation(async () => {
      cleanupRounds++;
      return cleanupRounds === 1 ? pending.promise : [];
    });
    const service = startWatermarkRuntime({
      db: connection.db,
      watermarksRoot: directory,
      hasUploadReference: () => false,
      logger: { error() {} },
    });
    try {
      service.pause();
      let idle = false;
      const drained = service.waitForIdle().then(() => {
        idle = true;
      });
      await Promise.resolve();
      expect(idle).toBe(false);
      pending.resolve([]);
      await drained;
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(cleanupRounds).toBe(1);
      service.resume();
      await vi.waitFor(() => expect(cleanupRounds).toBeGreaterThan(1));
    } finally {
      pending.resolve([]);
      await service.stop();
      connection.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
