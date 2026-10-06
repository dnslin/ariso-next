import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { oauthFault } from '../../../e2e/oauth-transport.mjs';

const target = '/api/settings/github';

// Execute the actual serialized Page callbacks in an isolated document. The
// underlying fetch is a unit double; these checks claim no browser/OAuth result.
function browserPage(removeFails = false) {
  const original = vi.fn(async () => new Response('{}', { status: 200 }));
  const context = createContext({
    fetch: original,
    URL,
    location: { href: 'https://ariso.example/settings/account' },
  });
  runInContext('window = globalThis', context);
  const scripts = new Map<string, string>();
  const removed: string[] = [];
  const evaluate = (fn: { toString(): string }, argument?: unknown) =>
    runInContext(
      `(${fn.toString()})(${JSON.stringify(argument) ?? 'undefined'})`,
      context,
    );
  const page = {
    async evaluate(fn: { toString(): string }, argument?: unknown) {
      return structuredClone(await evaluate(fn, argument));
    },
    async waitForFunction(fn: { toString(): string }) {
      await vi.waitFor(() => expect(evaluate(fn)).toBe(true));
    },
    async cdp(
      method: string,
      params: { source?: string; identifier?: string },
    ) {
      if (method === 'Page.addScriptToEvaluateOnNewDocument') {
        scripts.set('oauth-script', params.source!);
        return { identifier: 'oauth-script' };
      }
      if (method === 'Page.removeScriptToEvaluateOnNewDocument') {
        removed.push(params.identifier!);
        if (removeFails) throw new Error('script removal failed');
        scripts.delete(params.identifier!);
      }
    },
  };
  return {
    page,
    original,
    context,
    scripts,
    removed,
    reload() {
      for (const source of scripts.values()) runInContext(source, context);
    },
    send(path = target, method = 'PATCH', body?: object): Promise<Response> {
      return runInContext(
        `fetch(${JSON.stringify(path)}, ${JSON.stringify({ method, ...(body ? { body: JSON.stringify(body) } : {}) })})`,
        context,
      );
    },
  };
}

describe('OAuth response-delivery faults', () => {
  it('counts every matching attempt while unrelated methods and paths use the original fetch', async () => {
    const f = browserPage();
    const fault = await oauthFault(f.page, { path: target, method: 'PATCH' });
    try {
      await f.send(target, 'PATCH', { clientId: 'first' });
      await f.send(target, 'GET');
      await f.send('/api/account/github', 'PATCH');
      await f.send(target, 'POST');
      await f.send(target, 'PATCH', { clientId: 'second' });
      expect(f.original).toHaveBeenCalledTimes(5);
      expect(await fault.result()).toMatchObject({
        requests: 2,
        status: 200,
        input: { clientId: 'first', secret: 'keep' },
      });
    } finally {
      await fault.dispose();
    }
  });

  it.each(['reject', 'lose', 'hold'] as const)(
    '%s applies only to the first request and still counts a second write',
    async (mode) => {
      const f = browserPage();
      const fault = await oauthFault(f.page, {
        path: target,
        method: 'PATCH',
        [mode]: true,
      });
      try {
        const first = f.send();
        let finished = false;
        let completion: Promise<number> | undefined;
        if (mode === 'hold') {
          completion = first.then((response) => {
            finished = true;
            return response.status;
          });
          await fault.result();
          expect(finished).toBe(false);
        } else
          await expect(first).rejects.toThrow(
            mode === 'reject' ? 'request not sent' : 'real OAuth response lost',
          );
        expect((await f.send()).status).toBe(200);
        expect(f.original).toHaveBeenCalledTimes(mode === 'reject' ? 1 : 2);
        expect((await fault.result()).requests).toBe(2);
        if (mode === 'hold') {
          expect(finished).toBe(false);
          await fault.release();
          await expect(completion).resolves.toBe(200);
        }
      } finally {
        await fault.dispose();
      }
    },
  );

  it('loses real reconciliation responses after a write without replaying the write fault', async () => {
    const f = browserPage();
    const fault = await oauthFault(f.page, {
      path: target,
      method: 'PATCH',
      lose: true,
      failReconcile: true,
    });
    try {
      await expect(f.send()).rejects.toThrow('real OAuth response lost');
      await expect(f.send(target, 'GET')).rejects.toThrow(
        'reconciliation response lost',
      );
      await expect(f.send(target, 'GET')).rejects.toThrow(
        'reconciliation response lost',
      );
      expect((await f.send()).status).toBe(200);
      expect(f.original).toHaveBeenCalledTimes(4);
      expect(await fault.result()).toMatchObject({
        requests: 2,
        reads: 2,
        status: 200,
        readStatus: 200,
      });
    } finally {
      await fault.dispose();
    }
  });

  it('dispose releases a held real response and restores the original fetch without fault state', async () => {
    const f = browserPage();
    const fault = await oauthFault(f.page, {
      path: target,
      method: 'PATCH',
      hold: true,
    });
    const pending = f.send();
    await fault.result();
    await fault.dispose();
    expect((await pending).status).toBe(200);
    expect(f.context.fetch).toBe(f.original);
    expect(f.context.__oauthFault).toBeUndefined();
    expect((await f.send()).status).toBe(200);
    expect(f.original).toHaveBeenCalledTimes(2);
  });

  it('reload installation is removed and its current-document fetch is restored', async () => {
    const f = browserPage();
    const fault = await oauthFault(f.page, {
      path: target,
      method: 'PATCH',
      lose: true,
      reload: true,
    });
    expect(f.context.fetch).toBe(f.original);
    f.reload();
    await expect(f.send()).rejects.toThrow('real OAuth response lost');
    await fault.dispose();
    expect(f.removed).toEqual(['oauth-script']);
    expect(f.scripts.size).toBe(0);
    expect(f.context.fetch).toBe(f.original);
    expect(f.context.__oauthFault).toBeUndefined();
  });

  it('a script-removal failure remains observable while current fetch and held response are restored', async () => {
    const f = browserPage(true);
    const fault = await oauthFault(f.page, {
      path: target,
      method: 'PATCH',
      hold: true,
      reload: true,
    });
    f.reload();
    const pending = f.send();
    await fault.result();
    await expect(fault.dispose()).rejects.toThrow('script removal failed');
    expect((await pending).status).toBe(200);
    expect(f.context.fetch).toBe(f.original);
    expect(f.context.__oauthFault).toBeUndefined();
  });
});
