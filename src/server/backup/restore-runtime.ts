import { statfsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import type { Logger } from 'pino';
import type { openRuntimeDatabase } from '../runtime/db.ts';
import type { BuildIdentity } from '../runtime/build-info.ts';
import {
  claimRestoreSetup,
  releaseRestoreSetup,
  verifySetupCode,
  type SetupState,
} from '../identity/setup.ts';
import { assertEmptyRestoreTarget } from './restore-target.ts';
import { BackupError } from './errors.ts';
import { createRestoreRemote } from './restore-remote.ts';
import { readRestoreRemoteSources } from './restore-sources.ts';
import { restoreRemoteTargetInputSchema } from './restore-remote-validation.ts';
import type {
  RestoreRemoteTargetInput,
  RestoreRemoteTestInput,
} from './restore-remote-types.ts';
import { backupFailure } from './failure.ts';
import { listRestoreJobs, readJobState, writeJobState } from './jobs.ts';
import { createRestoreReceiver } from './restore-upload.ts';
import { runBackupWorker } from './worker.ts';
import type { BackupWorkerInput } from './worker-protocol.ts';
import type { RestoreJob } from './types.ts';

type Options = {
  db: ReturnType<typeof openRuntimeDatabase>['db'];
  dataDir: string;
  encryptionKey: Uint8Array;
  application: BuildIdentity | null;
  setup: SetupState;
  logger: Pick<Logger, 'error' | 'warn' | 'info'>;
  workerFile?: string | URL;
};
type Phase = 'decrypting' | 'restoring';

// DATA_DIR paths are resolved by Node at runtime, outside Next's build asset graph.
const { join } = process.getBuiltinModule('node:path');

export function createRestoreRuntime(options: Options) {
  let stopping = false;
  let job: RestoreJob | undefined;
  let receiver: ReturnType<typeof createRestoreReceiver> | undefined;
  let task:
    | {
        kind: Phase | 'target-test';
        controller: AbortController;
        done: Promise<void>;
        cancelStatus?: 'cancelled' | 'interrupted';
      }
    | undefined;
  let cancellation: { id: string; done: Promise<RestoreJob> } | undefined;
  const directory = (id: string) => join(options.dataDir, 'restore', id);
  const pending = listRestoreJobs(options.dataDir).filter(
    (item) =>
      item.cleanupPending || !['cancelled', 'completed'].includes(item.status),
  );
  if (options.setup.code && pending.length) {
    if (pending.length !== 1)
      throw new BackupError(
        'RESTORE_MULTIPLE_TASKS',
        409,
        '存在多个未结束的恢复任务，请检查恢复目录',
      );
    job = pending[0];
    if (['receiving', 'decrypting', 'restoring'].includes(job.status)) {
      job = {
        ...job,
        status: 'interrupted',
        failedPhase: job.status,
        failure: backupFailure({ code: 'BACKUP_INTERRUPTED' }, job.status),
        updatedAt: Date.now(),
      };
      writeJobState(directory(job.id), job);
    }
    claimRestoreSetup(options.setup, job.id);
  }

  function remoteFor(id: string) {
    return createRestoreRemote({
      jobDirectory: directory(id),
      jobId: id,
      encryptionKey: options.encryptionKey,
      sources: readRestoreRemoteSources(directory(id)),
    });
  }
  function present(item: RestoreJob): RestoreJob {
    return item.summary?.storages.some((storage) => storage.type === 's3')
      ? { ...item, targets: remoteFor(item.id).list() }
      : item;
  }
  if (job?.summary?.storages.some((storage) => storage.type === 's3'))
    remoteFor(job.id).recoverTests();

  function requireJob(id: string) {
    if (!job || job.id !== id)
      throw new BackupError(
        'RESTORE_NOT_FOUND',
        404,
        '当前恢复任务不存在，请重新验证初始化码',
      );
    return job;
  }
  function ensureAvailable(allowCleanup = false) {
    if (stopping)
      throw new BackupError(
        'RESTORE_STOPPING',
        503,
        '服务正在停止，请稍后重新连接',
      );
    if (cancellation)
      throw new BackupError(
        'RESTORE_CANCELLING',
        409,
        '正在停止恢复，请等待完成',
      );
    if (job?.cleanupPending && !allowCleanup)
      throw new BackupError(
        'RESTORE_CLEANUP_PENDING',
        409,
        '请先继续停止并清理上次恢复的临时文件',
      );
  }
  function application() {
    if (!options.application)
      throw new BackupError(
        'BACKUP_BUILD_UNAVAILABLE',
        409,
        '当前构建没有发布版本信息，请使用与备份相同的应用版本',
      );
    return options.application;
  }
  function save(next: RestoreJob) {
    writeJobState(directory(next.id), next);
    job = next;
  }
  function receiving(id: string) {
    requireJob(id);
    return (receiver ??= createRestoreReceiver({
      directory: directory(id),
      getState: () => requireJob(id),
      saveState: save,
    }));
  }
  function retryable(item: RestoreJob, phase: Phase) {
    return (
      (item.status === 'failed' || item.status === 'interrupted') &&
      item.failedPhase === phase
    );
  }
  async function removeTemporary(id: string, names: string[]) {
    for (const name of names)
      await rm(join(directory(id), name), { recursive: true, force: true });
  }
  function launch(id: string, phase: Phase, input: BackupWorkerInput) {
    ensureAvailable();
    if (task || receiver?.receiving)
      throw new BackupError(
        'RESTORE_BUSY',
        409,
        '当前阶段仍在进行，请查询任务状态',
      );
    const currentJob = requireJob(id);
    save({
      ...currentJob,
      status: phase,
      failure: undefined,
      failedPhase: undefined,
      progress: undefined,
      updatedAt: Date.now(),
    });
    const current = {
      kind: phase,
      controller: new AbortController(),
      done: Promise.resolve(),
      cancelStatus: undefined as 'cancelled' | 'interrupted' | undefined,
    };
    task = current;
    current.done = (async () => {
      let lastSaved = 0;
      try {
        const result = await runBackupWorker(input, {
          workerFile: options.workerFile,
          signal: current.controller.signal,
          onEvent(event) {
            if (Date.now() - lastSaved < 1000 || !event.progress) return;
            lastSaved = Date.now();
            save({
              ...requireJob(id),
              progress: event.progress,
              updatedAt: Date.now(),
            });
          },
        });
        current.controller.signal.throwIfAborted();
        if (result.kind === 'backup')
          throw new Error('Unexpected restore worker result');
        if (
          phase === 'decrypting' &&
          result.summary.storages.some((storage) => storage.type === 's3')
        )
          remoteFor(id);
        save({
          ...requireJob(id),
          status: phase === 'decrypting' ? 'configuring' : 'ready',
          summary: result.summary,
          application: input.application,
          publicUrl: requireJob(id).publicUrl ?? result.summary.publicUrl,
          updatedAt: Date.now(),
          failure: undefined,
          failedPhase: undefined,
        });
        // The durable next-stage record comes first; a restart can still use its complete prepared files.
        try {
          await removeTemporary(
            id,
            phase === 'decrypting'
              ? ['source.zip.age']
              : [
                  'source.zip.age',
                  'source.zip.age.part',
                  'content.zip',
                  'content.zip.part',
                  'work',
                ],
          );
        } catch (cleanupError) {
          options.logger.warn(
            { err: cleanupError, jobId: id },
            'Restore is prepared but temporary cleanup is incomplete',
          );
        }
      } catch (err) {
        const status = current.controller.signal.aborted
          ? (current.cancelStatus ?? 'interrupted')
          : 'failed';
        const next: RestoreJob = {
          ...requireJob(id),
          status,
          failedPhase: phase,
          failure:
            status === 'cancelled'
              ? undefined
              : backupFailure(
                  status === 'interrupted'
                    ? { code: 'BACKUP_INTERRUPTED' }
                    : err,
                  phase,
                ),
          updatedAt: Date.now(),
        };
        options.logger.error(
          { err, jobId: id, phase },
          'Restore phase did not complete',
        );
        // Even a full disk must not leave an ended in-process task displayed as running.
        job = next;
        try {
          writeJobState(directory(id), next);
        } catch (stateError) {
          options.logger.error(
            { err: stateError, jobId: id },
            'Cannot persist restore failure',
          );
        }
      } finally {
        if (task === current) task = undefined;
      }
    })();
    void current.done.catch((err) =>
      options.logger.error({ err, jobId: id }, 'Restore task cleanup failed'),
    );
    return present(requireJob(id));
  }

  return {
    authorize(code: string) {
      verifySetupCode(options.db, options.setup, code);
      if (stopping)
        throw new BackupError(
          'RESTORE_STOPPING',
          503,
          '服务正在停止，请稍后重新连接',
        );
    },
    current() {
      return {
        job: job ? present(job) : null,
        application: options.application,
      };
    },
    read: (id: string) => present(requireJob(id)),
    create(id: string, uploadBytes: number) {
      ensureAvailable();
      const build = application();
      if (job || readJobState(directory(id)))
        throw new BackupError(
          'RESTORE_IN_PROGRESS',
          409,
          '已有恢复任务或本次请求已被接收，请继续当前任务',
        );
      assertEmptyRestoreTarget({ db: options.db, dataDir: options.dataDir });
      const disk = statfsSync(options.dataDir);
      if (disk.bavail * disk.bsize < uploadBytes * 2 + 16 * 1024 * 1024)
        throw new BackupError(
          'BACKUP_NO_SPACE',
          507,
          '备份接收和解密需要更多临时空间，请释放空间后重试',
        );
      claimRestoreSetup(options.setup, id);
      const now = Date.now();
      try {
        save({
          kind: 'restore',
          id,
          status: 'receiving',
          createdAt: now,
          updatedAt: now,
          uploadBytes,
          receivedBytes: 0,
          application: build,
        });
      } catch (error) {
        releaseRestoreSetup(options.setup, id);
        throw error;
      }
      return present(requireJob(id));
    },
    async receive(id: string, request: Request, offset: number, total: number) {
      ensureAvailable();
      await receiving(id).receive(request, offset, total);
      return present(requireJob(id));
    },
    async reset(id: string) {
      ensureAvailable();
      await receiving(id).reset();
      return present(requireJob(id));
    },
    decrypt(id: string, password: string) {
      const item = requireJob(id);
      if (item.status !== 'received' && !retryable(item, 'decrypting'))
        throw new BackupError(
          'RESTORE_STATE_CONFLICT',
          409,
          '当前阶段不能解密，请先完整上传备份文件',
        );
      return launch(id, 'decrypting', {
        kind: 'inspect',
        jobDirectory: directory(id),
        application: application(),
        password,
      });
    },
    async configure(id: string, publicUrl: string) {
      ensureAvailable();
      if (
        requireJob(id).status === 'configuring' &&
        task?.kind === 'decrypting'
      )
        await task.done;
      ensureAvailable();
      const item = requireJob(id);
      if (item.status !== 'configuring' || task)
        throw new BackupError(
          'RESTORE_STATE_CONFLICT',
          409,
          '恢复已开始或仍在处理，不能修改配置；如需变更，请先放弃本次恢复',
        );
      save({ ...item, publicUrl, updatedAt: Date.now() });
      return present(requireJob(id));
    },
    async saveTarget(
      id: string,
      storageId: string,
      input: RestoreRemoteTargetInput,
    ) {
      ensureAvailable(true);
      if (
        requireJob(id).status === 'configuring' &&
        task?.kind === 'decrypting'
      )
        await task.done;
      ensureAvailable(true);
      const item = requireJob(id);
      if (
        task ||
        (item.status !== 'configuring' &&
          !(item.status === 'cancelled' && item.cleanupPending))
      )
        throw new BackupError(
          'RESTORE_STATE_CONFLICT',
          409,
          '当前阶段不能修改恢复目标',
        );
      const remote = remoteFor(id);
      if (item.status === 'cancelled') {
        const previous = remote
          .list()
          .find((target) => target.storageId === storageId);
        const parsed = restoreRemoteTargetInputSchema.parse(input);
        if (
          !previous ||
          (
            [
              'endpoint',
              'region',
              'bucket',
              'pathPrefix',
              'forcePathStyle',
            ] as const
          ).some((field) => previous[field] !== parsed[field])
        )
          throw new BackupError(
            'RESTORE_TARGET_CLEANUP_REQUIRED',
            409,
            '恢复已停止；清理残留期间只能修正原目标的凭据',
          );
      }
      remote.saveTarget(storageId, input);
      return present(item);
    },
    async testTarget(
      id: string,
      storageId: string,
      input: RestoreRemoteTestInput,
    ) {
      ensureAvailable();
      if (
        requireJob(id).status === 'configuring' &&
        task?.kind === 'decrypting'
      )
        await task.done;
      ensureAvailable();
      if (task || requireJob(id).status !== 'configuring')
        throw new BackupError(
          'RESTORE_STATE_CONFLICT',
          409,
          '当前阶段不能测试恢复目标',
        );
      const current = {
        kind: 'target-test' as const,
        controller: new AbortController(),
        done: Promise.resolve(),
        cancelStatus: undefined as 'cancelled' | 'interrupted' | undefined,
      };
      const testing = remoteFor(id).testTarget(
        storageId,
        input,
        current.controller.signal,
      );
      task = current;
      current.done = testing
        .then(
          () => undefined,
          (err) => {
            options.logger.error(
              { err, jobId: id, storageId },
              'Restore target test did not complete',
            );
          },
        )
        .finally(() => {
          if (task === current) task = undefined;
        });
      return present(requireJob(id));
    },
    async execute(id: string) {
      ensureAvailable();
      if (
        requireJob(id).status === 'configuring' &&
        task?.kind === 'decrypting'
      )
        await task.done;
      ensureAvailable();
      const item = requireJob(id);
      if (
        (item.status !== 'configuring' && !retryable(item, 'restoring')) ||
        !item.publicUrl
      )
        throw new BackupError(
          'RESTORE_STATE_CONFLICT',
          409,
          '请先核对备份并保存新站点地址',
        );
      if (task)
        throw new BackupError(
          'RESTORE_BUSY',
          409,
          '恢复目标仍在测试，请等待完成',
        );
      if (item.summary?.storages.some((storage) => storage.type === 's3'))
        remoteFor(id).configurations();
      assertEmptyRestoreTarget({ db: options.db, dataDir: options.dataDir });
      return launch(id, 'restoring', {
        kind: 'restore',
        jobId: id,
        jobDirectory: directory(id),
        application: application(),
        encryptionKey: options.encryptionKey,
        publicUrl: item.publicUrl,
      });
    },
    async cancel(id: string) {
      if (cancellation?.id === id) return cancellation.done;
      const existing = readJobState<RestoreJob>(directory(id));
      if (
        existing &&
        !existing.cleanupPending &&
        (existing.status === 'cancelled' || existing.status === 'completed')
      )
        return existing;
      ensureAvailable(true);
      const item = requireJob(id);
      if (item.status === 'activating')
        throw new BackupError(
          'RESTORE_ACTIVATING',
          409,
          '恢复正在启用，请从部署日志检查并继续重启',
        );
      const done = Promise.resolve()
        .then(async () => {
          // Persist the intent before stopping anything; restart must not activate a ready task being cancelled.
          save({
            ...requireJob(id),
            status: 'cancelled',
            cleanupPending: true,
            failure: undefined,
            updatedAt: Date.now(),
          });
          const current = task;
          if (current) {
            current.cancelStatus = 'cancelled';
            current.controller.abort(
              new Error('Restore cancelled by operator'),
            );
          }
          await receiver?.stop();
          await current?.done;
          const cancelled: RestoreJob = {
            ...requireJob(id),
            status: 'cancelled',
            cleanupPending: true,
            failure: undefined,
            updatedAt: Date.now(),
          };
          save(cancelled);
          try {
            const targets = cancelled.summary?.storages.some(
              (storage) => storage.type === 's3',
            )
              ? await remoteFor(id).cleanup()
              : undefined;
            for (const entry of await readdir(directory(id)))
              if (
                !['state.json', 'remote.json', 'remote-plan.json'].includes(
                  entry,
                )
              )
                await rm(join(directory(id), entry), {
                  recursive: true,
                  force: true,
                });
            const completed = {
              ...cancelled,
              ...(targets ? { targets } : {}),
              cleanupPending: undefined,
              failure: undefined,
              updatedAt: Date.now(),
            };
            save(completed);
            releaseRestoreSetup(options.setup, id);
            job = undefined;
            receiver = undefined;
            return present(completed);
          } catch (err) {
            options.logger.error(
              { err, jobId: id, directory: directory(id) },
              'Restore cancellation cleanup failed; retry remains available',
            );
            job = {
              ...cancelled,
              failure: {
                code: 'RESTORE_CLEANUP_FAILED',
                message:
                  '恢复已停止，但临时文件尚未清理完成，请重试清理；详细位置见服务日志',
              },
              updatedAt: Date.now(),
            };
            try {
              writeJobState(directory(id), job);
            } catch (stateError) {
              options.logger.error(
                { err: stateError, jobId: id },
                'Cannot persist restore cleanup failure',
              );
            }
            throw new BackupError(
              'RESTORE_CLEANUP_FAILED',
              500,
              job.failure!.message,
            );
          }
        })
        .finally(() => {
          if (cancellation?.id === id) cancellation = undefined;
        });
      cancellation = { id, done };
      return done;
    },
    async stop() {
      stopping = true;
      if (cancellation) {
        await cancellation.done;
        return;
      }
      const current = task;
      if (current) {
        current.cancelStatus = 'interrupted';
        current.controller.abort(new Error('Application stopping'));
      }
      await receiver?.stop();
      await current?.done;
      if (job?.status === 'receiving')
        save({
          ...job,
          status: 'interrupted',
          failedPhase: 'receiving',
          failure: backupFailure({ code: 'BACKUP_INTERRUPTED' }, 'receiving'),
          updatedAt: Date.now(),
        });
    },
  };
}
