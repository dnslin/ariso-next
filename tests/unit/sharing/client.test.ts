import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

type Body = {
  status?: number;
  showName?: boolean;
  items?: { id: string; displayName?: string }[];
};
type Probe = {
  status: number;
  items: Body['items'];
  ignored: number;
  refresh(): Promise<void>;
  load(kind: string): Promise<void>;
};
const body = { showName: true, items: [{ id: 'one', displayName: 'Name' }] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function client() {
  const calls: {
    signal: AbortSignal;
    response: ReturnType<typeof deferred<Response>>;
  }[] = [];
  const listeners = new Map<string, () => void>();
  const document = {
    visibilityState: 'visible',
    addEventListener(name: string, callback: () => void) {
      listeners.set(name, callback);
    },
    getElementById: () => ({ textContent: '' }),
  };
  const window = {
    sharingInitial: { ...body, status: 200, token: 'experiment-token' },
    addEventListener() {},
    sharingProbe: undefined as Probe | undefined,
  };
  runInNewContext(
    readFileSync(resolve('tests/experiments/sharing/client.js'), 'utf8'),
    {
      window,
      document,
      AbortController,
      Map,
      Set,
      setInterval() {
        return 1;
      },
      clearInterval() {},
      fetch(_url: string, { signal }: { signal: AbortSignal }) {
        const response = deferred<Response>();
        calls.push({ signal, response });
        return response.promise;
      },
    },
  );
  return {
    probe: window.sharingProbe!,
    calls,
    visibility(value: string) {
      document.visibilityState = value;
      listeners.get('visibilitychange')!();
    },
  };
}
const response = (value: Body, status = 200) =>
  new Response(JSON.stringify(value), { status });

it('hidden then immediately visible starts a fresh check while the canceled check cannot clear the new pending cycle', async () => {
  const { probe, calls, visibility } = client();
  const old = probe.refresh();
  visibility('hidden');
  visibility('visible');
  expect(calls).toHaveLength(2);
  expect(calls[0].signal.aborted).toBe(true);
  expect(calls[1].signal.aborted).toBe(false);
  calls[0].response.resolve(response(body));
  await old;
  await probe.refresh();
  expect(calls).toHaveLength(2);
  calls[1].response.resolve(response(body));
});

it('a real decoded list held past a revoked authorization never restores its images', async () => {
  const { probe, calls } = client();
  const decoded = deferred<Body>();
  const entered = deferred<void>();
  const stale = probe.load('items');
  const oldResponse = response(body);
  oldResponse.json = async () => {
    entered.resolve();
    return decoded.promise;
  };
  calls[0].response.resolve(oldResponse);
  await entered.promise;
  const revoked = probe.load('neighbors');
  calls[1].response.resolve(response({ status: 401 }, 401));
  await revoked;
  expect(probe.status).toBe(401);
  expect(probe.items).toEqual([]);
  decoded.resolve(body);
  await stale;
  expect(probe.ignored).toBe(1);
  expect(probe.items).toEqual([]);
});
