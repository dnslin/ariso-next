import { waitWithSignal } from './idle.ts';
import { BackupError } from '../backup/errors.ts';

export class ContentMutationPausedError extends BackupError {
  readonly operation: string;

  constructor(operation: string) {
    super(
      'SITE_BACKUP_IN_PROGRESS',
      409,
      '正在创建备份，暂时无法修改内容；备份结束后会自动恢复',
    );
    this.operation = operation;
  }
}

export function isContentMutationPaused(
  error: unknown,
): error is ContentMutationPausedError {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'SITE_BACKUP_IN_PROGRESS'
  );
}

export type ContentMutations = ReturnType<typeof createContentMutations>;

/** One gate per Web runtime; only explicitly classified content operations enter it. */
export function createContentMutations() {
  let paused = false;
  let active = 0;
  const waiting = new Set<() => void>();
  return {
    get paused() {
      return paused;
    },
    get activeCount() {
      return active;
    },
    async run<T>(label: string, operation: () => T | Promise<T>): Promise<T> {
      if (paused) throw new ContentMutationPausedError(label);
      active++;
      try {
        return await operation();
      } finally {
        active--;
        if (active === 0) for (const resolve of waiting) resolve();
      }
    },
    closeAdmission() {
      paused = true;
    },
    openAdmission() {
      paused = false;
    },
    async waitForIdle(signal?: AbortSignal) {
      signal?.throwIfAborted();
      if (active === 0) return;
      let resolveIdle!: () => void;
      const idle = new Promise<void>((resolve) => {
        resolveIdle = resolve;
      });
      waiting.add(resolveIdle);
      try {
        await waitWithSignal(idle, signal);
      } finally {
        waiting.delete(resolveIdle);
      }
    },
  };
}
