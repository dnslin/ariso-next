import { createWriteStream } from 'node:fs';
import { open, rename, rm, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { BackupError } from './errors.ts';
import type { RestoreJob } from './types.ts';

export const RESTORE_CHUNK_BYTES = 8 * 1024 * 1024;

export function createRestoreReceiver(context: {
  directory: string;
  getState(): RestoreJob;
  saveState(state: RestoreJob): void;
}) {
  const partial = join(context.directory, 'source.zip.age.part');
  const destination = join(context.directory, 'source.zip.age');
  let writing: { controller: AbortController; done: Promise<void> } | undefined;
  let resetting = false;
  let resetWork: Promise<void> | undefined;
  let stopped = false;

  async function receiveBlock(
    request: Request,
    offset: number,
    total: number,
    controller: AbortController,
  ) {
    const signal = AbortSignal.any([request.signal, controller.signal]);
    const expected = Math.min(RESTORE_CHUNK_BYTES, total - offset);
    let received = 0;
    let published = false;
    try {
      await pipeline(
        Readable.fromWeb(request.body as NodeReadableStream<Uint8Array>),
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            received += chunk.length;
            if (received > expected) {
              callback(
                new BackupError(
                  'BACKUP_UPLOAD_SIZE',
                  413,
                  '本次上传分块超过允许大小',
                ),
              );
            } else callback(null, chunk);
          },
        }),
        createWriteStream(partial, {
          flags: offset ? 'r+' : 'w',
          start: offset,
          mode: 0o600,
        }),
        { signal },
      );
      if (received !== expected)
        throw new BackupError(
          'BACKUP_UPLOAD_INCOMPLETE',
          400,
          '分块未完整接收，请重试本次上传',
        );
      signal.throwIfAborted();
      const file = await open(partial, 'r+');
      try {
        await file.sync();
      } finally {
        await file.close();
      }
      signal.throwIfAborted();
      const complete = offset + received === total;
      if (complete) {
        await rename(partial, destination);
        published = true;
        const directory = await open(context.directory, 'r');
        try {
          await directory.sync();
        } finally {
          await directory.close();
        }
      }
      context.saveState({
        ...context.getState(),
        receivedBytes: offset + received,
        status: complete ? 'received' : 'receiving',
        updatedAt: Date.now(),
      });
    } catch (error) {
      if (!published) {
        try {
          await truncate(partial, offset);
        } catch (rollbackError) {
          if ((rollbackError as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw new AggregateError(
              [error, rollbackError],
              '恢复上传失败，截回已确认文件范围时也失败',
            );
          }
        }
      }
      throw error;
    }
  }

  return {
    get receiving() {
      return writing !== undefined || resetting;
    },
    async receive(request: Request, offset: number, total: number) {
      const state = context.getState();
      if (stopped || resetting || writing || state.status !== 'receiving')
        throw new BackupError(
          'BACKUP_UPLOAD_BUSY',
          409,
          '文件正在接收或已进入下一阶段，请刷新状态',
        );
      if (offset !== state.receivedBytes)
        throw new BackupError(
          'BACKUP_UPLOAD_OFFSET',
          409,
          '上传位置已变化，请查询已接收位置后重试',
        );
      if (total !== state.uploadBytes || offset >= total)
        throw new BackupError(
          'BACKUP_UPLOAD_SIZE',
          409,
          '备份文件长度与当前恢复任务不一致',
        );
      if (!request.body)
        throw new BackupError(
          'BACKUP_UPLOAD_INCOMPLETE',
          400,
          '请上传备份文件内容',
        );
      const current = {
        controller: new AbortController(),
        done: Promise.resolve(),
      };
      writing = current;
      current.done = receiveBlock(
        request,
        offset,
        total,
        current.controller,
      ).finally(() => {
        if (writing === current) writing = undefined;
      });
      await current.done;
    },
    async reset() {
      const state = context.getState();
      if (
        stopped ||
        resetting ||
        !(
          state.status === 'receiving' ||
          (state.status === 'interrupted' && state.failedPhase === 'receiving')
        )
      )
        throw new BackupError(
          'BACKUP_UPLOAD_STATE',
          409,
          '已接收或开始恢复的文件不能重置',
        );
      resetting = true;
      const work = (async () => {
        if (writing) {
          writing.controller.abort(
            new BackupError('BACKUP_UPLOAD_RESET', 409, '文件接收已重置'),
          );
          // The original receive request reports its own failure. Reset waits until its writer has closed.
          await Promise.allSettled([writing.done]);
        }
        const file = await open(partial, 'w', 0o600);
        try {
          await file.sync();
        } finally {
          await file.close();
        }
        // A previous process may have published bytes just before its state write failed.
        await rm(destination, { force: true });
        context.saveState({
          ...context.getState(),
          status: 'receiving',
          receivedBytes: 0,
          updatedAt: Date.now(),
          failure: undefined,
          failedPhase: undefined,
        });
      })();
      resetWork = work;
      try {
        await work;
      } finally {
        resetting = false;
        if (resetWork === work) resetWork = undefined;
      }
    },
    async stop() {
      stopped = true;
      writing?.controller.abort(
        new BackupError('BACKUP_UPLOAD_STOPPED', 409, '文件接收已停止'),
      );
      await Promise.allSettled([
        ...(writing ? [writing.done] : []),
        ...(resetWork ? [resetWork] : []),
      ]);
    },
  };
}
