import {
  createCorsTest,
  finishCorsTest,
  expireCorsProbes,
  recoverCorsProbes,
} from './cors.ts';
import type { CorsBrowserResult } from './cors-types.ts';
import { setTimeout as delay } from 'node:timers/promises';
import { and, eq, lte } from 'drizzle-orm';
import type { Logger } from 'pino';
import { storageProbes } from './schema.ts';
import {
  cleanupProbe,
  probeError,
  recoverProbes,
  testStorageConnection,
  type ProbeContext,
  type ProbeInput,
} from './probes.ts';

/** One instance per Web process; the owning runtime closes SQLite after stop settles. */
export function startStorageProbeRuntime(
  context: ProbeContext & { logger: Pick<Logger, 'info' | 'error'> },
) {
  const active = new Map<
    string,
    {
      controller: AbortController;
      promise: Promise<unknown>;
    }
  >();
  const cleaning = new Map<string, Promise<void>>();
  const stopping = new AbortController();
  recoverProbes(context);
  recoverCorsProbes(context);
  function clean(id: string) {
    const existing = cleaning.get(id);
    if (existing) return existing;
    const probe = context.db
      .select()
      .from(storageProbes)
      .where(eq(storageProbes.id, id))
      .get();
    if (!probe) return Promise.resolve();
    const promise = cleanupProbe(context, probe).finally(() =>
      cleaning.delete(id),
    );
    cleaning.set(id, promise);
    return promise;
  }
  const maintenance = (async () => {
    while (!stopping.signal.aborted) {
      expireCorsProbes(context);
      const pending = context.db
        .select()
        .from(storageProbes)
        .where(
          and(
            eq(storageProbes.state, 'cleanup'),
            lte(storageProbes.nextCleanupAt, new Date()),
          ),
        )
        .all();
      for (const probe of pending) {
        if (stopping.signal.aborted) break;
        if (active.has(probe.storageId)) continue;
        try {
          await clean(probe.id);
        } catch (err) {
          context.logger.error(
            {
              err,
              storageId: probe.storageId,
              probeId: probe.id,
              key: probe.key,
            },
            'Storage probe cleanup failed',
          );
        }
      }
      try {
        await delay(60_000, undefined, { signal: stopping.signal, ref: false });
      } catch (error) {
        if (!stopping.signal.aborted) throw error;
      }
    }
  })();
  void maintenance.catch((err: unknown) =>
    context.logger.error({ err }, 'Storage probe maintenance stopped'),
  );
  function corsOperation<T>(
    storageId: string,
    operation: (signal: AbortSignal) => Promise<T>,
  ) {
    if (stopping.signal.aborted)
      throw probeError('STORAGE_STOPPING', '服务正在停止', 503);
    if (active.has(storageId))
      throw probeError('STORAGE_IN_USE', '该存储正在执行探测');
    const controller = new AbortController();
    const promise = operation(controller.signal).finally(() =>
      active.delete(storageId),
    );
    active.set(storageId, { controller, promise });
    return promise;
  }
  return {
    startCors(storageId: string, revision: number, origin: string | null) {
      return corsOperation(storageId, () =>
        createCorsTest(context, storageId, revision, origin),
      );
    },
    finishCors(
      storageId: string,
      probeId: string,
      origin: string | null,
      results: CorsBrowserResult[],
    ) {
      return corsOperation(storageId, (signal) =>
        finishCorsTest(context, storageId, probeId, origin, results, signal),
      );
    },
    test(storageId: string, input: ProbeInput, signal?: AbortSignal) {
      if (stopping.signal.aborted)
        throw probeError('STORAGE_STOPPING', '服务正在停止', 503);
      if (active.has(storageId))
        throw probeError('STORAGE_IN_USE', '该存储正在执行连接测试');
      const controller = new AbortController();
      const promise = testStorageConnection(
        context,
        storageId,
        input,
        signal
          ? AbortSignal.any([signal, controller.signal])
          : controller.signal,
      )
        .then((report) => {
          context.logger.info(
            { storageId, report },
            'Storage connection test finished',
          );
          return report;
        })
        .finally(() => active.delete(storageId));
      active.set(storageId, { controller, promise });
      return promise;
    },
    async retryCleanup(storageId: string, probeId: string) {
      if (stopping.signal.aborted)
        throw probeError('STORAGE_STOPPING', '服务正在停止', 503);
      const probe = context.db
        .select()
        .from(storageProbes)
        .where(
          and(
            eq(storageProbes.id, probeId),
            eq(storageProbes.storageId, storageId),
          ),
        )
        .get();
      if (!probe) throw probeError('STORAGE_NOT_FOUND', '探测记录不存在', 404);
      if (probe.state !== 'cleanup' || active.has(storageId))
        throw probeError('STORAGE_IN_USE', '探测仍在执行或由其他流程负责');
      if (!cleaning.has(probeId))
        context.db
          .update(storageProbes)
          .set({ cleanupAttempts: 0, nextCleanupAt: new Date() })
          .where(eq(storageProbes.id, probeId))
          .run();
      await clean(probeId);
      return { cleaned: true, probeId };
    },
    async stop() {
      stopping.abort();
      for (const operation of active.values())
        operation.controller.abort(new Error('服务正在停止'));
      await Promise.allSettled(
        [...active.values()].map((operation) => operation.promise),
      );
      await maintenance;
      await Promise.allSettled(cleaning.values());
    },
  };
}
