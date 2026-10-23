import { resolve } from 'node:path';
import type {
  BackupWorkerInput,
  BackupWorkerMessage,
  BackupWorkerProgress,
  BackupWorkerResult,
} from './worker-protocol.ts';

// The CLI worker is compiled and traced separately; Node owns its runtime entry.
const { Worker } = process.getBuiltinModule('node:worker_threads');

/** Resolve only after exit: callers may then release the freeze or remove this task's files. */
export async function runBackupWorker(
  input: BackupWorkerInput,
  options: {
    signal?: AbortSignal;
    onEvent?: (event: BackupWorkerProgress) => void;
    workerFile?: string | URL;
  } = {},
): Promise<BackupWorkerResult> {
  options.signal?.throwIfAborted();
  return new Promise((resolveResult, reject) => {
    const worker = new Worker(
      options.workerFile ?? resolve('dist/cli/backup-worker.js'),
      { workerData: input, execArgv: [] },
    );
    let result: BackupWorkerResult | undefined;
    let failure: Error | undefined;
    let forcedStop: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      worker.postMessage({ type: 'cancel' });
      forcedStop ??= setTimeout(() => {
        void worker.terminate();
      }, 5000);
      forcedStop.unref();
    };
    options.signal?.addEventListener('abort', cancel, { once: true });
    worker.on('message', (message: BackupWorkerMessage) => {
      if (message.type === 'complete') result = message.result;
      else if (message.type === 'error')
        failure ??= Object.assign(new Error(message.message), {
          code: message.code,
        });
      else {
        if (failure || options.signal?.aborted) return;
        try {
          options.onEvent?.(message);
        } catch (error) {
          failure =
            error instanceof Error
              ? error
              : new Error('Cannot save backup task progress');
          cancel();
        }
      }
    });
    worker.once('error', (error) => {
      failure ??= error;
    });
    worker.once('exit', (code) => {
      clearTimeout(forcedStop);
      options.signal?.removeEventListener('abort', cancel);
      if (options.signal?.aborted) reject(options.signal.reason);
      else if (failure) reject(failure);
      else if (code !== 0 || !result)
        reject(
          new Error(`Backup worker exited without completing (exit ${code})`),
        );
      else resolveResult(result);
    });
    if (options.signal?.aborted) cancel();
  });
}
