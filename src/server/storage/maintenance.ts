import { setTimeout as delay } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { removeEmptyNamespace } from './local.ts';
import { requireNoStorageReferences } from './references.ts';
import { scanStorage, type ScanContext } from './scans.ts';
import {
  storageConfigs,
  storageOrphans,
  storageScans,
  storageSettings,
} from './schema.ts';

/** Scans and configuration removal share one per-storage execution lane in the Web process. */
export function startStorageMaintenance(
  context: ScanContext & {
    logger: Pick<Logger, 'error'>;
    clearReleasedReferences: (db: BetterSQLite3Database, id: string) => void;
  },
  intervalMs = 60_000,
) {
  const stopping = new AbortController();
  const active = new Map<string, Promise<unknown>>();
  const deleting = new Map<
    string,
    Promise<{ deleted: true; storageId: string }>
  >();
  function scan(id: string) {
    if (stopping.signal.aborted)
      throw Object.assign(new Error('服务正在停止'), {
        code: 'STORAGE_STOPPING',
        status: 503,
      });
    const existing = active.get(id);
    if (existing) return existing;
    const operation = scanStorage(context, id, {
      signal: stopping.signal,
    }).finally(() => active.delete(id));
    active.set(id, operation);
    return operation;
  }
  const maintenance = (async () => {
    while (!stopping.signal.aborted) {
      const configs = context.db
        .select({ id: storageConfigs.id })
        .from(storageConfigs)
        .all();
      for (const { id } of configs) {
        if (stopping.signal.aborted) break;
        if (deleting.has(id)) continue;
        try {
          await scan(id);
        } catch (err) {
          if (!stopping.signal.aborted)
            context.logger.error(
              { err, storageId: id },
              'Storage orphan scan failed',
            );
        }
      }
      try {
        await delay(intervalMs, undefined, {
          signal: stopping.signal,
          ref: false,
        });
      } catch (error) {
        if (!stopping.signal.aborted) throw error;
      }
    }
  })();
  void maintenance.catch((err: unknown) =>
    context.logger.error({ err }, 'Storage orphan maintenance stopped'),
  );

  async function remove(id: string) {
    // Let an existing scan settle before starting the required fresh deletion round.
    const previous = active.get(id);
    if (previous) {
      try {
        await previous;
      } catch {
        // Its error is persisted and reported by its owner. This deletion retries a full round.
      }
    }
    stopping.signal.throwIfAborted();
    const snapshot = context.db.transaction((tx) => {
      const config = tx
        .select()
        .from(storageConfigs)
        .where(eq(storageConfigs.id, id))
        .get();
      if (!config)
        throw Object.assign(new Error(`存储不存在: ${id}`), {
          code: 'STORAGE_NOT_FOUND',
          storageId: id,
        });
      requireNoStorageReferences(id, context.readReferences(tx, id), false);
      tx.update(storageConfigs)
        .set({ enabled: false, updatedAt: new Date() })
        .where(eq(storageConfigs.id, id))
        .run();
      return config;
    });
    await scan(id);
    if (snapshot.type === 'local') {
      try {
        await removeEmptyNamespace(context.storageRoot, {
          id,
          localPath: snapshot.localPath!,
          enabled: false,
        });
      } catch (error) {
        context.db
          .update(storageScans)
          .set({
            status: 'failed',
            finishedAt: new Date(),
            error: {
              message: error instanceof Error ? error.message : String(error),
              operation: 'remove-empty-namespace',
            },
          })
          .where(eq(storageScans.storageId, id))
          .run();
        throw Object.assign(
          error instanceof Error ? error : new Error(String(error)),
          { status: 500 },
        );
      }
    }
    return context.db.transaction((tx) => {
      stopping.signal.throwIfAborted();
      const current = tx
        .select()
        .from(storageConfigs)
        .where(eq(storageConfigs.id, id))
        .get();
      if (
        !current ||
        current.enabled ||
        current.configRevision !== snapshot.configRevision
      )
        throw Object.assign(new Error(`删除期间存储配置已修改: ${id}`), {
          code: 'STORAGE_TEST_STALE',
          storageId: id,
        });
      requireNoStorageReferences(id, context.readReferences(tx, id));
      context.clearReleasedReferences(tx, id);
      tx.update(storageSettings)
        .set({ defaultStorageId: null })
        .where(eq(storageSettings.defaultStorageId, id))
        .run();
      tx.delete(storageConfigs).where(eq(storageConfigs.id, id)).run();
      return { deleted: true as const, storageId: id };
    });
  }
  return {
    scan,
    deleteStorage(id: string) {
      if (stopping.signal.aborted)
        throw Object.assign(new Error('服务正在停止'), {
          code: 'STORAGE_STOPPING',
          status: 503,
        });
      const existing = deleting.get(id);
      if (existing) return existing;
      const operation = remove(id).finally(() => deleting.delete(id));
      deleting.set(id, operation);
      return operation;
    },
    async stop() {
      stopping.abort();
      await maintenance;
      await Promise.allSettled([...active.values(), ...deleting.values()]);
    },
  };
}

/** Only discovered pending bytes, excluding keys already accounted for by their real owner. */
export function readStorageOrphanUsage(
  context: Pick<ScanContext, 'db' | 'readReferences'>,
  id: string,
) {
  const refs = context.readReferences(context.db, id);
  const objects = context.db
    .select()
    .from(storageOrphans)
    .where(eq(storageOrphans.storageId, id))
    .all()
    .filter((object) => !refs.keys.has(object.key));
  return {
    storageId: id,
    knownBytes: objects.reduce((total, object) => total + object.size, 0),
    objects,
  };
}
