import { setTimeout as delay } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import {
  cleanupSession,
  expireQueuedSessions,
  pendingCleanups,
  recoverUploadSessions,
  type UploadContext,
} from './cleanup.ts';
import { cancelSession, getSession } from './sessions.ts';
import { receiveSession } from './receive.ts';
import { UploadError } from './errors.ts';
import { uploadSessions } from './schema.ts';

export function startUploadRuntime(
  context: UploadContext & { logger: Pick<Logger, 'info' | 'error'> },
) {
  const active = new Map<
    string,
    { controller: AbortController; promise: ReturnType<typeof receiveSession> }
  >();
  const cleaning = new Map<string, Promise<void>>();
  const stopping = new AbortController();
  recoverUploadSessions(context.db);
  function clean(id: string) {
    const existing = cleaning.get(id);
    if (existing) return existing;
    const operation = cleanupSession(context, id).finally(() =>
      cleaning.delete(id),
    );
    cleaning.set(id, operation);
    return operation;
  }
  const maintenance = (async () => {
    while (!stopping.signal.aborted) {
      expireQueuedSessions(context.db);
      for (const { id } of pendingCleanups(context.db)) {
        if (active.has(id)) continue;
        try {
          await clean(id);
        } catch (err) {
          context.logger.error({ err, sessionId: id }, 'Upload cleanup failed');
        }
      }
      try {
        await delay(60_000, undefined, { signal: stopping.signal, ref: false });
      } catch (error) {
        if (!stopping.signal.aborted) throw error;
      }
    }
  })();
  // Attach a rejection observer immediately; stop() still reports the original failure.
  void maintenance.catch((err: unknown) =>
    context.logger.error({ err }, 'Upload maintenance stopped'),
  );
  return {
    receive(id: string, request: Request) {
      if (stopping.signal.aborted)
        throw new UploadError('UPLOAD_STOPPING', '服务正在停止', 503);
      if (active.has(id))
        throw new UploadError('UPLOAD_STATE_CONFLICT', '会话正在接收', 409);
      const controller = new AbortController();
      const promise = receiveSession(context, id, request, controller.signal)
        .then((result) => {
          context.logger.info(
            {
              sessionId: id,
              imageId: result.imageId,
              storageId: result.storageId,
              byteSize: result.byteSize,
            },
            'Upload accepted',
          );
          return result;
        })
        .finally(() => active.delete(id));
      active.set(id, { controller, promise });
      return promise;
    },
    async cancel(id: string) {
      cancelSession(context.db, id);
      const operation = active.get(id);
      if (operation) {
        operation.controller.abort(
          new UploadError('UPLOAD_CANCELLED', '上传已取消', 409),
        );
        await operation.promise.catch(() => undefined); // Original request reports its failure.
      } else {
        await clean(id);
      }
      return getSession(context.db, id);
    },
    async retryCleanup(id: string) {
      const session = getSession(context.db, id);
      if (
        active.has(id) ||
        !['failed', 'cancelled', 'expired'].includes(session.state)
      )
        throw new UploadError(
          'UPLOAD_STATE_CONFLICT',
          '当前会话不能清理',
          409,
          session.imageId,
        );
      context.db
        .update(uploadSessions)
        .set({
          cleanupAttempts: 0,
          cleanupStatus: 'pending',
          nextCleanupAt: null,
        })
        .where(eq(uploadSessions.id, id))
        .run();
      await clean(id);
      return getSession(context.db, id);
    },
    async stop() {
      stopping.abort();
      for (const operation of active.values())
        operation.controller.abort(
          new UploadError('UPLOAD_INTERRUPTED', '服务正在停止', 503),
        );
      await Promise.allSettled(
        [...active.values()].map((operation) => operation.promise),
      );
      await maintenance;
      await Promise.allSettled(cleaning.values());
    },
  };
}
