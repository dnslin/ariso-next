import { and, asc, eq, gt } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { createSecretCrypto } from '../runtime/crypto.ts';
import * as local from './local.ts';
import { clientConfig } from './probes.ts';
import type { ReadStorageReferences } from './references.ts';
import { createS3Storage } from './s3.ts';
import {
  storageConfigs,
  storageOrphans,
  storageScans,
  type StorageConfig,
  type StorageScan,
  type StorageScanError,
} from './schema.ts';

type Options = { signal?: AbortSignal };
export type ScanAdapter = {
  listObjects(options: Options): AsyncIterable<{ key: string; size: number }[]>;
  deleteObject(key: string, options: Options): Promise<unknown>;
  destroy(): void;
};
export type ScanContext = {
  db: BetterSQLite3Database;
  storageRoot: string;
  secretCrypto: ReturnType<typeof createSecretCrypto>;
  readReferences: ReadStorageReferences;
  adapterFactory?: (config: StorageConfig) => ScanAdapter;
};
export function readStorageScan(db: BetterSQLite3Database, id: string) {
  return (
    db
      .select()
      .from(storageScans)
      .where(eq(storageScans.storageId, id))
      .get() ?? null
  );
}
function configuration(db: BetterSQLite3Database, id: string) {
  const row = db
    .select()
    .from(storageConfigs)
    .where(eq(storageConfigs.id, id))
    .get();
  if (!row)
    throw Object.assign(new Error(`存储不存在: ${id}`), {
      code: 'STORAGE_NOT_FOUND',
      storageId: id,
    });
  return row;
}
function snapshot(config: StorageConfig) {
  return JSON.stringify([
    config.type,
    config.configRevision,
    config.localPath,
    config.endpoint,
    config.region,
    config.bucket,
    config.pathPrefix,
    config.forcePathStyle,
    config.accessKeyEncrypted,
    config.secretKeyEncrypted,
  ]);
}
function diagnostic(cause: unknown): StorageScanError {
  const error = cause as StorageScanError;
  return {
    message: cause instanceof Error ? cause.message : String(cause),
    code: error?.code,
    key: error?.key,
    operation: error?.operation,
    serviceCode: error?.serviceCode,
    httpStatusCode: error?.httpStatusCode,
    requestId: error?.requestId,
  };
}
function adapter(context: ScanContext, config: StorageConfig): ScanAdapter {
  if (context.adapterFactory) return context.adapterFactory(config);
  if (config.type === 's3')
    return createS3Storage(clientConfig(context, config));
  if (!config.localPath) throw new Error(`本地存储缺少路径: ${config.id}`);
  const storage = {
    id: config.id,
    localPath: config.localPath,
    enabled: config.enabled,
  };
  return {
    listObjects: (options) =>
      local.listObjects(context.storageRoot, storage, options),
    deleteObject: async (key, options) => {
      options.signal?.throwIfAborted();
      await local.deleteObject(context.storageRoot, storage, key);
    },
    destroy() {},
  };
}

/** Business references are supplied by the composition caller; storage never imports their owners. */
export async function scanStorage(
  context: ScanContext,
  id: string,
  options: Options = {},
) {
  const config = configuration(context.db, id);
  const physical = snapshot(config);
  const state: StorageScan = {
    storageId: id,
    configRevision: config.configRevision,
    scope: {
      type: config.type,
      localPath: config.localPath,
      endpoint: config.endpoint,
      bucket: config.bucket,
      pathPrefix: config.pathPrefix,
      namespace: `${config.type === 's3' && config.pathPrefix ? `${config.pathPrefix.replace(/^\/+|\/+$/g, '')}/` : ''}ariso/${id}/`,
    },
    startedAt: new Date(),
    finishedAt: null,
    status: 'running',
    discoveredCount: 0,
    deletedCount: 0,
    failedCount: 0,
    protectedCount: 0,
    error: null,
  };
  context.db
    .insert(storageScans)
    .values(state)
    .onConflictDoUpdate({
      target: storageScans.storageId,
      set: state,
    })
    .run();
  const save = () =>
    context.db
      .update(storageScans)
      .set(state)
      .where(eq(storageScans.storageId, id))
      .run();
  const current = () => {
    options.signal?.throwIfAborted();
    if (snapshot(configuration(context.db, id)) !== physical)
      throw Object.assign(new Error(`扫描期间存储配置已修改: ${id}`), {
        code: 'STORAGE_SCAN_STALE',
        storageId: id,
        status: 409,
      });
  };
  const orphanWhere = (key: string) =>
    and(eq(storageOrphans.storageId, id), eq(storageOrphans.key, key));
  const removeOrphan = (key: string) =>
    context.db.delete(storageOrphans).where(orphanWhere(key)).run();
  let storage: ScanAdapter | undefined;
  async function cleanup(key: string, countProtection = true) {
    current();
    const refs = context.readReferences(context.db, id, key);
    if (refs.keys.has(key)) {
      removeOrphan(key);
      if (countProtection) state.protectedCount++;
      save();
      return;
    }
    if (refs.activeWrites > 0) {
      if (countProtection) state.protectedCount++;
      save();
      return;
    }
    try {
      await storage!.deleteObject(key, options);
      current();
      removeOrphan(key);
      state.deletedCount++;
    } catch (cause) {
      if (
        options.signal?.aborted ||
        (cause as { code?: string })?.code === 'STORAGE_SCAN_STALE'
      )
        throw cause;
      const error = { ...diagnostic(cause), key };
      context.db
        .update(storageOrphans)
        .set({ error })
        .where(orphanWhere(key))
        .run();
      state.failedCount++;
      state.error = error;
    }
    save();
  }
  try {
    current();
    storage = adapter(context, config);
    // Retry previous responsibilities before enumeration, with bounded database pages.
    let after: string | undefined;
    while (true) {
      const pending = context.db
        .select()
        .from(storageOrphans)
        .where(
          and(
            eq(storageOrphans.storageId, id),
            ...(after === undefined ? [] : [gt(storageOrphans.key, after)]),
          ),
        )
        .orderBy(asc(storageOrphans.key))
        .limit(1000)
        .all();
      if (!pending.length) break;
      for (const orphan of pending) await cleanup(orphan.key, false);
      after = pending.at(-1)!.key;
    }
    for await (const batch of storage.listObjects(options)) {
      current();
      for (const object of batch) {
        current();
        const refs = context.readReferences(context.db, id, object.key);
        if (refs.keys.has(object.key)) {
          removeOrphan(object.key);
          state.protectedCount++;
          save();
          continue;
        }
        const previous = context.db
          .select()
          .from(storageOrphans)
          .where(orphanWhere(object.key))
          .get();
        context.db
          .insert(storageOrphans)
          .values({
            storageId: id,
            key: object.key,
            size: object.size,
            confirmedAt: new Date(),
            error: null,
          })
          .onConflictDoUpdate({
            target: [storageOrphans.storageId, storageOrphans.key],
            set: { size: object.size, confirmedAt: new Date() },
          })
          .run();
        state.discoveredCount++;
        save();
        // A remaining row was already attempted or protected in this round's history pass.
        if (!previous) await cleanup(object.key);
        else if (refs.activeWrites > 0) {
          state.protectedCount++;
          save();
        }
      }
    }
    current();
    if (state.failedCount)
      throw Object.assign(
        new Error(`存储扫描有 ${state.failedCount} 个对象清理失败: ${id}`),
        { code: 'STORAGE_SCAN_FAILED' },
      );
    state.status = 'passed';
    state.finishedAt = new Date();
    save();
    return state;
  } catch (cause) {
    state.status = options.signal?.aborted ? 'interrupted' : 'failed';
    state.finishedAt = new Date();
    state.error =
      state.failedCount &&
      (cause as { code?: string })?.code === 'STORAGE_SCAN_FAILED'
        ? state.error
        : diagnostic(cause);
    save();
    throw Object.assign(
      new Error(`存储孤儿扫描失败: ${id}: ${state.error?.message}`, { cause }),
      {
        code:
          state.status === 'interrupted'
            ? 'STORAGE_SCAN_INTERRUPTED'
            : 'STORAGE_SCAN_FAILED',
        storageId: id,
        scan: state,
        status:
          (cause as { status?: number })?.status ??
          (state.error?.code === 'STORAGE_TIMEOUT'
            ? 504
            : config.type === 's3' &&
                [
                  'STORAGE_OPERATION_FAILED',
                  'STORAGE_BUCKET_UNSUPPORTED',
                ].includes(state.error?.code ?? '')
              ? 502
              : 500),
      },
    );
  } finally {
    storage?.destroy();
  }
}
