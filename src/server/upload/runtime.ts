import { createMediaResources } from '../media/resources.ts';
import { setTimeout as delay } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import {
  cleanupSession,
  expireUploadSessions,
  pendingCleanups,
  purgeUploadResults,
  recoverUploadSessions,
  type UploadContext,
} from './cleanup.ts';
import {
  cancelSession,
  getPreparedSession,
  getSession,
  getSubmission,
  resubmitSession,
} from './sessions.ts';
import { beginSession, completeSession } from './s3.ts';
import { receiveSession } from './receive.ts';
import { receivePublicSession } from './public-receive.ts';
import { UploadError } from './errors.ts';
import { uploadSessions } from './schema.ts';

export function startUploadRuntime(
  context: UploadContext & { logger: Pick<Logger, 'info' | 'error'> },
) {
  context.resources ??= createMediaResources();
  const active = new Map<
    string,
    {
      storageId: string | null;
      controller: AbortController;
      promise: ReturnType<typeof receiveSession>;
    }
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
      expireUploadSessions(context.db);
      for (const [id, operation] of active) {
        if (getSession(context.db, id).state === 'expired')
          operation.controller.abort(
            new UploadError('UPLOAD_EXPIRED', '提交一小时内无上传活动', 409),
          );
      }
      for (const { id } of pendingCleanups(context.db)) {
        if (active.has(id)) continue;
        try {
          await clean(id);
        } catch (err) {
          context.logger.error({ err, sessionId: id }, 'Upload cleanup failed');
        }
      }
      purgeUploadResults(context.db);
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
  function run(
    id: string,
    operation: (signal: AbortSignal) => ReturnType<typeof receiveSession>,
  ) {
    if (stopping.signal.aborted)
      throw new UploadError('UPLOAD_STOPPING', '服务正在停止', 503);
    const controller = new AbortController();
    const storageId = getSession(context.db, id).storageId;
    const promise = operation(controller.signal)
      .then(async (result) => {
        if (result.state === 'accepted' && result.cleanupStatus !== 'none') {
          try {
            await clean(id);
          } catch (err) {
            context.logger.error(
              { err, sessionId: id },
              'Accepted upload temporary cleanup failed',
            );
          }
        }
        context.logger.info(
          {
            sessionId: id,
            imageId: result.imageId,
            storageId: result.storageId,
            byteSize: result.byteSize,
          },
          'Upload accepted',
        );
        return getPreparedSession(context.db, id);
      })
      .finally(() => active.delete(id));
    active.set(id, { storageId, controller, promise });
    return promise;
  }
  return {
    activeWrites(storageId: string) {
      let writes = 0;
      for (const [id, operation] of active) {
        operation.storageId = getSession(context.db, id).storageId;
        if (operation.storageId === storageId) writes++;
      }
      return writes;
    },
    async resubmit(id: string, requestId: string) {
      if (stopping.signal.aborted)
        throw new UploadError('UPLOAD_STOPPING', '服务正在停止', 503);
      if (active.has(id))
        throw new UploadError(
          'UPLOAD_STATE_CONFLICT',
          '正在接收或固定的会话不能重新提交',
          409,
        );
      const submission = resubmitSession(context.db, id, requestId);
      const previous = context.db
        .select()
        .from(uploadSessions)
        .where(eq(uploadSessions.id, id))
        .get();
      if (
        previous?.cleanupStatus === 'pending' &&
        (!previous.nextCleanupAt || previous.nextCleanupAt <= new Date())
      ) {
        try {
          await clean(id);
        } catch (err) {
          context.logger.error(
            { err, sessionId: id },
            'Resubmitted upload temporary cleanup failed',
          );
        }
      }
      return getSubmission(context.db, submission.id);
    },
    begin(id: string, origin: string | null) {
      if (stopping.signal.aborted)
        throw new UploadError('UPLOAD_STOPPING', '服务正在停止', 503);
      return beginSession(context, id, origin);
    },
    receive(id: string, request: Request) {
      if (active.has(id))
        throw new UploadError('UPLOAD_STATE_CONFLICT', '会话正在接收', 409);
      return run(id, (signal) => receiveSession(context, id, request, signal));
    },
    receivePublic(id: string, request: Request, tokenId: string) {
      if (active.has(id))
        throw new UploadError('UPLOAD_STATE_CONFLICT', '会话正在接收', 409);
      return run(id, (signal) =>
        receivePublicSession(context, id, request, signal, tokenId),
      );
    },
    complete(id: string) {
      const session = getPreparedSession(context.db, id);
      if (session.route !== 'direct')
        throw new UploadError('UPLOAD_STATE_CONFLICT', '该会话不是直传', 409);
      const existing = active.get(id);
      return (
        existing?.promise ??
        run(id, (signal) => completeSession(context, id, signal))
      );
    },
    async cancel(id: string, transferFailed = false) {
      cancelSession(context.db, id, transferFailed);
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
        !['accepted', 'failed', 'cancelled', 'expired'].includes(session.state)
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
