import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DependencyList, EffectCallback } from 'react';
import { useAccessProtection } from '../../../src/components/access-protection/use-access-protection';
import type { AccessProtectionSettingsResponse } from '../../../src/server/access-protection/types';

// The existing settings tests use the same hook harness; DOM acceptance is run
// separately against the actual page and HeroUI controls.
const runtime = vi.hoisted(() => ({ current: null as Harness | null }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => runtime.current!.state(initial),
  useRef: (initial: unknown) => runtime.current!.ref(initial),
  useEffect: (effect: EffectCallback, deps?: DependencyList) =>
    runtime.current!.effect(effect, deps),
  useCallback: (callback: unknown) => callback,
}));
const actions = vi.hoisted(() => ({
  fetch: vi.fn(),
  toast: Object.assign(vi.fn(), { close: vi.fn() }),
  cache: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('@heroui/react/toast', () => ({ toast: actions.toast }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: actions.cache,
    invalidateQueries: actions.invalidate,
  }),
}));
function AccessProtectionHarness(
  value: AccessProtectionSettingsResponse | null,
) {
  return useAccessProtection(value);
}
class Harness {
  private cells: unknown[] = [];
  private cursor = 0;
  private pending: (() => void)[] = [];
  private cleanups = new Map<number, () => void>();
  state(initial: unknown) {
    const index = this.cursor++;
    if (!(index in this.cells))
      this.cells[index] = typeof initial === 'function' ? initial() : initial;
    return [
      this.cells[index],
      (value: unknown) => {
        this.cells[index] =
          typeof value === 'function' ? value(this.cells[index]) : value;
      },
    ];
  }
  ref(initial: unknown) {
    const index = this.cursor++;
    if (!(index in this.cells)) this.cells[index] = { current: initial };
    return this.cells[index];
  }
  effect(effect: EffectCallback, deps?: DependencyList) {
    const index = this.cursor++;
    const previous = this.cells[index] as DependencyList | undefined;
    if (
      !deps ||
      !previous ||
      deps.some((value, i) => !Object.is(value, previous[i]))
    ) {
      this.cells[index] = deps;
      this.pending.push(() => {
        this.cleanups.get(index)?.();
        const cleanup = effect();
        if (cleanup) this.cleanups.set(index, cleanup);
      });
    }
  }
  render(value: AccessProtectionSettingsResponse | null = initial) {
    this.cursor = 0;
    runtime.current = this;
    const editor = AccessProtectionHarness(value);
    for (const effect of this.pending.splice(0)) effect();
    return editor;
  }
  unmount() {
    for (const cleanup of this.cleanups.values()) cleanup();
  }
}
const initial: AccessProtectionSettingsResponse = {
  mode: 'observe',
  rate: 10,
  burst: 200,
  updatedAt: '2026-10-22T00:00:00.000Z',
  clientIp: { ready: true, message: null },
};
let harness: Harness;
beforeEach(() => {
  harness = new Harness();
  actions.fetch.mockReset();
  actions.toast.mockReset();
  actions.toast.close.mockReset();
  actions.cache.mockReset();
  actions.invalidate.mockReset();
  vi.stubGlobal('fetch', actions.fetch);
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback());
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.stubGlobal('document', {
    activeElement: null,
    querySelector: () => ({ focus: vi.fn() }),
  });
});
afterEach(() => {
  harness.unmount();
  vi.unstubAllGlobals();
});

it('waits for a fresh settings read and never replaces an edited draft with a later snapshot', async () => {
  expect(harness.render(null).locked).toBe(true);
  await harness.render(null).save();
  expect(actions.fetch).not.toHaveBeenCalled();
  harness.render();
  harness.render().change('rate', 20);
  expect(harness.render({ ...initial, rate: 40 }).input.rate).toBe(20);
});

it('submits only the three settings fields and publishes confirmed values to the summary cache', async () => {
  harness.render();
  harness.render().change('rate', 20);
  const response = { ...initial, rate: 20 };
  actions.fetch.mockResolvedValue(Response.json(response));
  await harness.render().save();
  expect(actions.fetch).toHaveBeenCalledWith(
    '/api/settings/access-protection',
    expect.objectContaining({ method: 'PATCH', cache: 'no-store' }),
  );
  expect(JSON.parse(actions.fetch.mock.calls[0][1].body)).toEqual({
    mode: 'observe',
    rate: 20,
    burst: 200,
  });
  expect(harness.render()).toMatchObject({
    saved: response,
    input: { mode: 'observe', rate: 20, burst: 200 },
    dirty: false,
    phase: 'ready',
  });
  expect(actions.cache).toHaveBeenCalledWith(['access-protection'], response);
});

it('validates numeric input but permits turning protection off using the previously saved limits', async () => {
  harness.render();
  harness.render().change('burst', 0.5);
  await harness.render().save();
  expect(actions.fetch).not.toHaveBeenCalled();
  expect(harness.render().errors.burst).toEqual(expect.any(String));
  harness.render().change('mode', 'off');
  expect(harness.render().errors).toEqual({});
  actions.fetch.mockResolvedValue(Response.json({ ...initial, mode: 'off' }));
  await harness.render().save();
  expect(JSON.parse(actions.fetch.mock.calls[0][1].body)).toEqual({
    mode: 'off',
    rate: 10,
    burst: 200,
  });
});

it('blocks enforce before IP readiness while observe and off remain available', async () => {
  const unconfigured = {
    ...initial,
    clientIp: { ready: false, message: '请配置来源 IP' },
  };
  harness.render(unconfigured);
  harness.render(unconfigured).change('mode', 'enforce');
  await harness.render(unconfigured).save();
  expect(actions.fetch).not.toHaveBeenCalled();
  expect(harness.render(unconfigured).ipBlocked).toBe(true);
  harness.render(unconfigured).change('mode', 'off');
  actions.fetch.mockResolvedValue(
    Response.json({ ...unconfigured, mode: 'off' }),
  );
  await harness.render(unconfigured).save();
  expect(actions.fetch).toHaveBeenCalledTimes(1);
});

it('keeps an uncertain write locked until GET confirms it and never automatically repeats PATCH', async () => {
  harness.render();
  harness.render().change('rate', 12);
  actions.fetch.mockRejectedValueOnce(new Error('network lost'));
  await harness.render().save();
  expect(harness.render()).toMatchObject({
    phase: 'unknown',
    locked: true,
    input: { rate: 12 },
  });
  await harness.render().save();
  expect(actions.fetch).toHaveBeenCalledTimes(1);
  actions.fetch.mockResolvedValueOnce(Response.json({ ...initial, rate: 12 }));
  await harness.render().reconcile();
  expect(
    actions.fetch.mock.calls.map((call) => call[1].method ?? 'GET'),
  ).toEqual(['PATCH', 'GET']);
  expect(harness.render()).toMatchObject({
    phase: 'ready',
    locked: false,
    dirty: false,
  });
});

it('shows read-back differences and requires choosing saved values or keeping the draft before another write', async () => {
  harness.render();
  harness.render().change('rate', 12);
  actions.fetch.mockRejectedValueOnce(new Error('network lost'));
  await harness.render().save();
  actions.fetch.mockResolvedValueOnce(Response.json({ ...initial, rate: 15 }));
  await harness.render().reconcile();
  expect(harness.render()).toMatchObject({
    phase: 'different',
    locked: true,
    saved: { rate: 15 },
    input: { rate: 12 },
  });
  await harness.render().save();
  expect(actions.fetch).toHaveBeenCalledTimes(2);
  harness.render().chooseSaved(false);
  expect(harness.render()).toMatchObject({
    phase: 'ready',
    input: { rate: 12 },
    dirty: true,
  });
});

it('retains HTTP field errors and prevents further writes after a 401', async () => {
  harness.render();
  harness.render().change('rate', 12);
  actions.fetch.mockResolvedValueOnce(
    Response.json(
      {
        message: '请修改频率',
        fields: [{ field: 'rate', message: '数值不正确' }],
      },
      { status: 422 },
    ),
  );
  await harness.render().save();
  expect(harness.render()).toMatchObject({
    errors: { rate: '数值不正确' },
    input: { rate: 12 },
    locked: false,
  });
  actions.fetch.mockResolvedValueOnce(
    Response.json({ message: '请重新登录' }, { status: 401 }),
  );
  await harness.render().save();
  expect(harness.render()).toMatchObject({
    expired: true,
    locked: true,
    input: { rate: 12 },
  });
  await harness.render().save();
  expect(actions.fetch).toHaveBeenCalledTimes(2);
});

it('prevents overlapping writes and ignores a late success after unmount', async () => {
  harness.render();
  harness.render().change('rate', 12);
  let resolve!: (value: Response) => void;
  actions.fetch.mockReturnValue(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  const saving = harness.render().save();
  await harness.render().save();
  expect(actions.fetch).toHaveBeenCalledTimes(1);
  const signal = actions.fetch.mock.calls[0][1].signal as AbortSignal;
  harness.unmount();
  expect(signal.aborted).toBe(true);
  resolve(Response.json({ ...initial, rate: 12 }));
  await saving;
  expect(actions.cache).not.toHaveBeenCalled();
  expect(actions.toast).not.toHaveBeenCalled();
});
