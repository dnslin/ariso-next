import { open, rm, stat } from 'node:fs/promises';
import type { openRuntimeDatabase } from '../runtime/db.ts';
import type { Logger } from 'pino';
import type { BuildIdentity } from '../runtime/build-info.ts';
import type { ContentMutations } from '../runtime/content-mutations.ts';
import { BackupError } from './errors.ts';
import { backupFailure } from './failure.ts';
import { listBackupJobs, readJobState, writeJobState } from './jobs.ts';
import { readBackupOverview } from './overview.ts';
import { runBackupWorker } from './worker.ts';
import type { BackupJob } from './types.ts';

export type BackupRuntimeOptions = {
  db: ReturnType<typeof openRuntimeDatabase>['db'];
  dataDir: string;
  encryptionKey: Uint8Array;
  application: BuildIdentity | null;
  logger: Pick<Logger, 'error' | 'warn' | 'info'>;
  workerFile?: string | URL;
  contentMutations: ContentMutations;
  quiescence: { acquire(signal?: AbortSignal): Promise<() => void> };
};
// DATA_DIR paths are resolved by Node at runtime, outside Next's build asset graph.
const { join } = process.getBuiltinModule('node:path');

const activeStatuses = new Set<BackupJob['status']>([
  'preparing',
  'copying',
  'finalizing',
]);

export function createBackupRuntime(options: BackupRuntimeOptions) {
  let stopping = false;
  let active:
    | {
        job: BackupJob;
        controller: AbortController;
        done: Promise<void>;
        cancelStatus?: 'cancelled' | 'interrupted';
      }
    | undefined;
  const downloads = new Map<string, number>();
  const deleting = new Set<string>();
  const directory = (id: string) => join(options.dataDir, 'backups', id);
  const initialized = Promise.resolve().then(() => {
    for (const job of listBackupJobs(options.dataDir)) {
      if (!activeStatuses.has(job.status)) continue;
      writeJobState(directory(job.id), {
        ...job,
        status: 'interrupted',
        failedPhase: job.status,
        updatedAt: Date.now(),
        failure: backupFailure({ code: 'BACKUP_INTERRUPTED' }, job.status),
      });
    }
  });
  void initialized.catch((err) =>
    options.logger.error({ err }, 'Cannot read backup task history'),
  );

  function read(id: string) {
    if (active?.job.id === id) return active.job;
    const job = readJobState<BackupJob>(directory(id));
    if (!job) throw new BackupError('BACKUP_NOT_FOUND', 404, '备份记录不存在');
    // A record cannot keep the site frozen when its worker is no longer present.
    return activeStatuses.has(job.status)
      ? {
          ...job,
          status: 'interrupted' as const,
          failure: backupFailure({ code: 'BACKUP_INTERRUPTED' }, job.status),
        }
      : job;
  }

  async function cleanup(job: BackupJob, includeArchive: boolean) {
    const paths = [
      'snapshot.db',
      'snapshot.db-wal',
      'snapshot.db-shm',
      `${job.fileName}.part`,
    ];
    if (includeArchive && job.fileName) paths.push(job.fileName);
    for (const path of paths)
      await rm(join(directory(job.id), path), { force: true });
  }

  return {
    async list(input: { limit?: number; cursor?: string } = {}) {
      await initialized;
      const jobs = listBackupJobs(options.dataDir).map((job) => read(job.id));
      const start = input.cursor
        ? jobs.findIndex((job) => job.id === input.cursor) + 1
        : 0;
      if (input.cursor && !start)
        throw new BackupError(
          'BACKUP_CURSOR_INVALID',
          400,
          '记录已变化，请刷新备份列表',
        );
      const items = jobs.slice(start, start + (input.limit ?? 20));
      return {
        items,
        nextCursor:
          start + items.length < jobs.length ? items.at(-1)!.id : null,
        ...readBackupOverview(options.db, options.dataDir, options.application),
      };
    },
    activity() {
      return {
        paused: options.contentMutations.paused,
        job: active?.job ?? null,
      };
    },
    async read(id: string) {
      await initialized;
      return read(id);
    },
    async create(id: string, password: string) {
      await initialized;
      if (stopping)
        throw new BackupError(
          'BACKUP_STOPPING',
          503,
          '服务正在停止，请稍后重试',
        );
      if (active || deleting.has(id) || readJobState(directory(id)))
        throw new BackupError(
          'BACKUP_IN_PROGRESS',
          409,
          '已有备份任务或本次请求已被接收，请查询任务状态',
        );
      if (!options.application)
        throw new BackupError(
          'BACKUP_BUILD_UNAVAILABLE',
          409,
          '当前构建没有发布版本信息，不能创建可恢复的备份',
        );
      const overview = readBackupOverview(
        options.db,
        options.dataDir,
        options.application,
      );
      if (overview.scope.freeBytes < overview.scope.estimatedBytes)
        throw new BackupError(
          'BACKUP_NO_SPACE',
          507,
          '可用磁盘空间不足，请释放空间后重试',
        );
      const now = Date.now();
      const job: BackupJob = {
        kind: 'backup',
        id,
        createdAt: now,
        updatedAt: now,
        status: 'preparing',
        application: options.application,
        fileName: `ariso-${new Date(now).toISOString().replaceAll(':', '-')}-${id}.zip.age`,
      };
      writeJobState(directory(id), job);
      const current = {
        job,
        controller: new AbortController(),
        done: Promise.resolve(),
        cancelStatus: undefined as 'cancelled' | 'interrupted' | undefined,
      };
      active = current;
      const save = (update: Partial<BackupJob>) => {
        const next = { ...current.job, ...update, updatedAt: Date.now() };
        writeJobState(directory(id), next);
        current.job = next;
      };
      current.done = (async () => {
        let release: (() => void) | undefined;
        let lastSaved = 0;
        try {
          release = await options.quiescence.acquire(current.controller.signal);
          const result = await runBackupWorker(
            {
              kind: 'backup',
              dataDir: options.dataDir,
              jobDirectory: directory(id),
              fileName: job.fileName!,
              application: options.application!,
              encryptionKey: options.encryptionKey,
              password,
            },
            {
              workerFile: options.workerFile,
              signal: current.controller.signal,
              onEvent(event) {
                if (
                  event.stage !== 'preparing' &&
                  event.stage !== 'copying' &&
                  event.stage !== 'finalizing'
                )
                  return;
                if (
                  Date.now() - lastSaved < 1000 &&
                  current.job.status === event.stage &&
                  !event.summary
                )
                  return;
                lastSaved = Date.now();
                save({
                  status: event.stage,
                  ...(event.summary ? { summary: event.summary } : {}),
                  ...(event.progress ? { progress: event.progress } : {}),
                });
              },
            },
          );
          current.controller.signal.throwIfAborted();
          if (result.kind !== 'backup')
            throw new Error('Unexpected backup worker result');
          await cleanup(current.job, false);
          save({
            status: 'ready',
            summary: result.summary,
            fileBytes: result.fileBytes,
          });
        } catch (err) {
          const phase = current.job.status;
          try {
            await cleanup(current.job, true);
          } catch (cleanupError) {
            options.logger.error(
              { err: cleanupError, jobId: id },
              'Backup temporary-file cleanup failed',
            );
          }
          const status = current.controller.signal.aborted
            ? (current.cancelStatus ?? 'cancelled')
            : 'failed';
          options.logger.error(
            { err, jobId: id, phase },
            'Backup task did not complete',
          );
          try {
            save({
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
            });
          } catch (stateError) {
            options.logger.error(
              { err: stateError, jobId: id },
              'Cannot persist backup failure',
            );
          }
        } finally {
          try {
            release?.();
          } finally {
            if (active === current) active = undefined;
          }
        }
      })();
      void current.done.catch((err) =>
        options.logger.error({ err, jobId: id }, 'Backup cleanup failed'),
      );
      return job;
    },
    async cancel(id: string) {
      await initialized;
      const existing = read(id);
      if (!activeStatuses.has(existing.status)) return existing;
      const current = active;
      if (
        !current ||
        current.job.id !== id ||
        !activeStatuses.has(current.job.status)
      )
        throw new BackupError(
          'BACKUP_NOT_ACTIVE',
          409,
          '任务已经结束，请刷新备份状态',
        );
      current.cancelStatus = 'cancelled';
      current.controller.abort(new Error('Backup cancelled by owner'));
      await current.done;
      return read(id);
    },
    async fileInfo(id: string) {
      await initialized;
      const job = read(id);
      if (job.status !== 'ready' || !job.fileName)
        throw new BackupError(
          'BACKUP_NOT_READY',
          409,
          '备份尚未完成，不能下载',
        );
      if (deleting.has(id))
        throw new BackupError('BACKUP_DELETING', 409, '备份正在删除');
      const info = await stat(join(directory(id), job.fileName));
      return { fileName: job.fileName, size: info.size };
    },
    async download(id: string) {
      await initialized;
      const job = read(id);
      if (job.status !== 'ready' || !job.fileName)
        throw new BackupError(
          'BACKUP_NOT_READY',
          409,
          '备份尚未完成，不能下载',
        );
      if (deleting.has(id))
        throw new BackupError('BACKUP_DELETING', 409, '备份正在删除');
      // Reserve before opening: delete and open otherwise race across this await.
      downloads.set(id, (downloads.get(id) ?? 0) + 1);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        const count = downloads.get(id)! - 1;
        if (count) downloads.set(id, count);
        else downloads.delete(id);
      };
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      try {
        handle = await open(join(directory(id), job.fileName), 'r');
        const info = await handle.stat();
        const stream = handle.createReadStream();
        stream.once('close', release);
        stream.once('error', release);
        return { fileName: job.fileName, size: info.size, stream };
      } catch (error) {
        try {
          await handle?.close();
        } finally {
          release();
        }
        throw error;
      }
    },
    async remove(id: string) {
      await initialized;
      read(id);
      if (active?.job.id === id)
        throw new BackupError(
          'BACKUP_IN_PROGRESS',
          409,
          '请先等待或取消当前备份',
        );
      if (downloads.has(id))
        throw new BackupError(
          'BACKUP_DOWNLOAD_ACTIVE',
          409,
          '文件正在下载，请等待下载结束后删除',
        );
      if (deleting.has(id))
        throw new BackupError('BACKUP_DELETING', 409, '备份正在删除');
      deleting.add(id);
      try {
        await rm(directory(id), { recursive: true });
      } finally {
        deleting.delete(id);
      }
    },
    async stop() {
      stopping = true;
      const current = active;
      if (!current) return;
      current.cancelStatus = 'interrupted';
      current.controller.abort(new Error('Application stopping'));
      await current.done;
    },
  };
}
