import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { readStorageSettings } from '../../../src/server/storage/settings.ts';
import { readStorageScan } from '../../../src/server/storage/scans.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

it('实际Web进程重启扫描停用存储中的迟到对象，保留相邻命名空间并在SIGTERM前停止维护', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-storage-restart-'));
  const env = {
    DATA_DIR: join(directory, 'data'),
    HOST: '127.0.0.1',
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  };
  const processes: Awaited<ReturnType<typeof launch>>[] = [];
  let connection: ReturnType<typeof openRuntimeDatabase> | undefined;
  const boot = async () => {
    const server = await launch(resolve('.next/standalone'), directory, env);
    processes.push(server);
    await vi.waitFor(
      async () => {
        if (server.child.exitCode !== null || server.child.signalCode !== null)
          throw new Error(server.logs());
        const health = await fetch(
          `http://127.0.0.1:${server.port}/api/health`,
          {
            signal: AbortSignal.timeout(2000),
          },
        );
        expect(health.status, server.logs()).toBe(200);
        expect(await health.json()).toEqual({ status: 'ok' });
      },
      { timeout: 15000 },
    );
    return server;
  };
  const shutdown = async (server: Awaited<ReturnType<typeof launch>>) => {
    await stop(server.child, server.closed);
    expect(await server.closed, server.logs()).toEqual([143, null]);
    const marker =
      'Upload and media queues stopped, analytics flushed, database closed';
    expect(server.logs()).toContain(marker);
    expect(server.logs()).not.toMatch(
      /Storage orphan (?:scan failed|maintenance stopped)|SqliteError|database connection is not open/i,
    );
    expect(
      server.logs().slice(server.logs().indexOf(marker) + marker.length),
    ).not.toMatch(/storage|sqlite|database/i);
  };
  try {
    const first = await boot();
    connection = openRuntimeDatabase(join(env.DATA_DIR, 'ariso.db'));
    const id = readStorageSettings(connection.db).defaultStorageId;
    expect(id).not.toBeNull();
    const storage = connection.db
      .select()
      .from(storageConfigs)
      .where(eq(storageConfigs.id, id!))
      .get();
    if (!storage || storage.type !== 'local' || storage.localPath === null)
      throw new Error(
        'prestart did not prepare the actual default local storage',
      );
    await expect
      .poll(() => readStorageScan(connection!.db, storage.id)?.status, {
        timeout: 5000,
      })
      .toBe('passed');
    const previous = readStorageScan(connection.db, storage.id)!;
    await shutdown(first);

    connection.db
      .update(storageConfigs)
      .set({ enabled: false })
      .where(eq(storageConfigs.id, storage.id))
      .run();
    const selectedRoot = join(env.DATA_DIR, 'storage', storage.localPath);
    const late = join(
      selectedRoot,
      'ariso',
      storage.id,
      'uploads',
      'late unknown + %.bin',
    );
    const neighbor = join(
      selectedRoot,
      'ariso',
      `neighbor-${randomUUID()}`,
      'preserved.bin',
    );
    const external = join(selectedRoot, 'other-application.bin');
    await mkdir(join(late, '..'), { recursive: true });
    await mkdir(join(neighbor, '..'), { recursive: true });
    await writeFile(late, 'late-upload-bytes');
    await writeFile(neighbor, 'neighbor-bytes');
    await writeFile(external, 'external-bytes');
    expect(existsSync(late)).toBe(true);

    const restarted = await boot();
    await expect.poll(() => existsSync(late), { timeout: 5000 }).toBe(false);
    await expect
      .poll(() => readStorageScan(connection!.db, storage.id)?.status, {
        timeout: 5000,
      })
      .toBe('passed');
    const scanned = readStorageScan(connection.db, storage.id)!;
    expect(scanned).toMatchObject({
      storageId: storage.id,
      configRevision: storage.configRevision,
      status: 'passed',
      discoveredCount: 1,
      deletedCount: 1,
      failedCount: 0,
      scope: {
        type: 'local',
        localPath: storage.localPath,
        namespace: `ariso/${storage.id}/`,
      },
    });
    expect(scanned.startedAt.getTime()).toBeGreaterThan(
      previous.finishedAt!.getTime(),
    );
    expect(
      connection.db
        .select()
        .from(storageConfigs)
        .where(eq(storageConfigs.id, storage.id))
        .get(),
    ).toMatchObject({ enabled: false, localPath: storage.localPath });
    expect(readStorageSettings(connection.db).defaultStorageId).toBe(
      storage.id,
    );
    expect(await readFile(neighbor, 'utf8')).toBe('neighbor-bytes');
    expect(await readFile(external, 'utf8')).toBe('external-bytes');
    expect(existsSync(selectedRoot)).toBe(true);
    await shutdown(restarted);
  } finally {
    for (const server of processes) await stop(server.child, server.closed);
    connection?.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 40000);
