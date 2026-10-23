import type { ContentMutations } from '../runtime/content-mutations.ts';
import { waitWithSignal } from '../runtime/idle.ts';
import { BackupError } from './errors.ts';

type PausableService = {
  pause(): void;
  resume(): void;
  waitForIdle(signal?: AbortSignal): Promise<void>;
};

type Context = {
  contentMutations: ContentMutations;
  mediaQueue: PausableService;
  uploads: PausableService;
  storageMaintenance: PausableService;
  storageProbes: PausableService;
  watermarks: PausableService;
  branding: Pick<PausableService, 'waitForIdle'>;
  flushAnalytics?: () => void;
};

export function createBackupQuiescence(context: Context) {
  const services = [
    context.mediaQueue,
    context.uploads,
    context.storageMaintenance,
    context.storageProbes,
    context.watermarks,
  ];
  let busy = false;
  return {
    async acquire(signal?: AbortSignal, timeoutMs = 60_000) {
      if (busy)
        throw new BackupError(
          'BACKUP_IN_PROGRESS',
          409,
          '已有备份正在准备或复制',
        );
      busy = true;
      context.contentMutations.closeAdmission();
      const deadline = new AbortController();
      const timer = setTimeout(
        () =>
          deadline.abort(
            new BackupError(
              'BACKUP_PREPARATION_TIMEOUT',
              409,
              '等待正在进行的修改结束超时，请稍后重试备份',
            ),
          ),
        timeoutMs,
      );
      const preparation = signal
        ? AbortSignal.any([signal, deadline.signal])
        : deadline.signal;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        const errors: unknown[] = [];
        for (const service of services) {
          try {
            service.resume();
          } catch (error) {
            errors.push(error);
          }
        }
        context.contentMutations.openAdmission();
        busy = false;
        if (errors.length === 1) throw errors[0];
        if (errors.length > 1)
          throw new AggregateError(errors, '恢复后台调度失败');
      };
      try {
        // Media must remain running until accepted public uploads finish waiting for it.
        await context.contentMutations.waitForIdle(preparation);
        for (const service of services) service.pause();
        await waitWithSignal(
          Promise.all(
            [...services, context.branding].map((service) =>
              service.waitForIdle(preparation),
            ),
          ),
          preparation,
        );
        context.flushAnalytics?.();
        return release;
      } catch (error) {
        try {
          release();
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            '备份准备失败，恢复后台调度时也发生错误',
          );
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
