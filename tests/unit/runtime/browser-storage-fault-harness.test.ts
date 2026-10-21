import { createContext, runInContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import {
  storageReadFault,
  loseStorageMutation,
} from '../../../e2e/storage-admin-layout.mjs';

// Run the actual serialized callbacks without an Ego session or HTTP server.
function documentPage(removeFails = false) {
  const original = vi.fn(async () => new Response('{}', { status: 200 }));
  const context = createContext({
    fetch: original,
    URL,
    location: { href: 'http://storage.localhost/settings/storage' },
  });
  runInContext('window = globalThis', context);
  const scripts = new Map<string, string>();
  const evaluate = (callback: { toString(): string }, argument?: unknown) =>
    runInContext(
      `(${callback.toString()})(${JSON.stringify(argument) ?? 'undefined'})`,
      context,
    );
  const page = {
    evaluate: async (callback: { toString(): string }, argument?: unknown) =>
      structuredClone(await evaluate(callback, argument)),
    waitForFunction: async (callback: { toString(): string }) => {
      await vi.waitFor(() => expect(evaluate(callback)).toBe(true));
    },
    cdp: async (
      method: string,
      argument: { source?: string; identifier?: string },
    ) => {
      if (method === 'Page.addScriptToEvaluateOnNewDocument') {
        scripts.set('storage-read', argument.source!);
        return { identifier: 'storage-read' };
      }
      if (method === 'Page.removeScriptToEvaluateOnNewDocument') {
        if (removeFails) throw new Error('script removal failed');
        scripts.delete(argument.identifier!);
      }
    },
  };
  return {
    page,
    original,
    context,
    scripts,
    reload() {
      for (const source of scripts.values()) runInContext(source, context);
    },
    send(path = '/api/storages', method = 'GET'): Promise<Response> {
      return runInContext(
        `fetch(${JSON.stringify(path)},${JSON.stringify({ method })})`,
        context,
      );
    },
  };
}

it('releases held real reads and removes both the reload script and current-document fault after an assertion fails', async () => {
  const f = documentPage();
  const fault = await storageReadFault(f.page, '/api/storages', 'hold');
  f.reload();
  const held = f.send();
  let finished = false;
  const completion = held.then((response) => {
    finished = true;
    return response.status;
  });
  expect((await fault.result()).status).toBe(200);
  expect(finished).toBe(false);
  try {
    throw new Error('layout assertion failed');
  } catch {
    await fault.dispose();
  }
  await expect(completion).resolves.toBe(200);
  expect(f.context.fetch).toBe(f.original);
  expect(f.context.__storageReadFault).toBeUndefined();
  expect(f.scripts.size).toBe(0);
  f.reload();
  expect((await f.send()).status).toBe(200);
});

it('drops actual GET responses, preserves unrelated methods, then restores normal retry without a lost-response wrapper', async () => {
  const f = documentPage();
  const fault = await storageReadFault(f.page, '/api/storages', 'fail');
  f.reload();
  expect((await f.send('/api/settings/storage')).status).toBe(200);
  expect((await f.send('/api/storages', 'POST')).status).toBe(200);
  await expect(f.send()).rejects.toThrow(
    'actual storage read response was lost',
  );
  expect((await fault.result()).status).toBe(200);
  await fault.release();
  expect((await f.send()).status).toBe(200);
  await fault.dispose();
  expect(f.context.fetch).toBe(f.original);
  expect(f.scripts.size).toBe(0);
});

it('retains script-removal errors while restoring current fetch and releasing held responses', async () => {
  const f = documentPage(true);
  const fault = await storageReadFault(f.page, '/api/storages', 'hold');
  f.reload();
  const held = f.send();
  await fault.result();
  await expect(fault.dispose()).rejects.toThrow('script removal failed');
  expect((await held).status).toBe(200);
  expect(f.context.fetch).toBe(f.original);
});

it('loses only the first matching committed mutation and restores its observer on disposal', async () => {
  const f = documentPage();
  const fault = await loseStorageMutation(
    f.page,
    '/api/storages/local',
    'PATCH',
  );
  await expect(f.send('/api/storages/local', 'PATCH')).rejects.toThrow(
    'actual storage mutation response was lost',
  );
  expect(f.context.__storageMutationStatus).toBe(200);
  expect((await f.send('/api/storages/local', 'PATCH')).status).toBe(200);
  expect((await f.send()).status).toBe(200);
  await fault.dispose();
  expect(f.context.fetch).toBe(f.original);
  expect(f.context.__storageMutationUsed).toBeUndefined();
  expect(f.context.__storageMutationStatus).toBeUndefined();
});
