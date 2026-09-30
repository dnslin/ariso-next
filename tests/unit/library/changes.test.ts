import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import {
  notifyLibraryChanged,
  subscribeLibraryChanges,
} from '../../../src/components/library/library-changes';

it('delivers same-document changes and releases the subscription on cleanup', async () => {
  const departed = vi.fn();
  const active = vi.fn();
  const unsubscribe = subscribeLibraryChanges(departed);
  const stopActive = subscribeLibraryChanges(active);
  try {
    notifyLibraryChanged();
    await vi.waitFor(() => expect(active).toHaveBeenCalledTimes(1));
    expect(departed).toHaveBeenCalledTimes(1);
    unsubscribe();
    notifyLibraryChanged();
    await vi.waitFor(() => expect(active).toHaveBeenCalledTimes(2));
    expect(departed).toHaveBeenCalledTimes(1);
  } finally {
    unsubscribe();
    stopActive();
  }
});

it('receives a change published by an independent JavaScript context', async () => {
  const changed = vi.fn();
  const unsubscribe = subscribeLibraryChanges(changed);
  const worker = new Worker(
    `const { workerData } = require('node:worker_threads');
     import(workerData.module).then(({ notifyLibraryChanged }) => notifyLibraryChanged());`,
    {
      eval: true,
      workerData: {
        module: pathToFileURL(
          resolve('src/components/library/library-changes.ts'),
        ).href,
      },
    },
  );
  try {
    await new Promise<void>((done, fail) => {
      worker.on('error', fail);
      worker.on('exit', (code) =>
        code === 0 ? done() : fail(new Error(`Worker exited ${code}`)),
      );
    });
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());
  } finally {
    unsubscribe();
    await worker.terminate();
  }
});
