import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DependencyList, EffectCallback } from 'react';
import type { Tag, TagPage } from '../../../src/app/tags/api';
import {
  findTagTarget,
  useTagTargetCreate,
} from '../../../src/components/library/use-tag-target-create';

const runtime = vi.hoisted(() => ({ current: null as Harness | null }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => runtime.current!.state(initial),
  useRef: (initial: unknown) => runtime.current!.ref(initial),
  useEffect: (effect: EffectCallback, deps?: DependencyList) =>
    runtime.current!.effect(effect, deps),
}));
class Harness {
  cells: unknown[] = [];
  cursor = 0;
  cleanups = new Map<number, () => void>();
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
      !previous ||
      !deps ||
      deps.some((value, i) => !Object.is(value, previous[i]))
    ) {
      this.cells[index] = deps;
      this.cleanups.get(index)?.();
      const cleanup = effect();
      if (cleanup) this.cleanups.set(index, cleanup);
    }
  }
  render(available: Tag[] = []) {
    this.cursor = 0;
    runtime.current = this;
    return TagCreateProbe(available);
  }
  unmount() {
    for (const cleanup of this.cleanups.values()) cleanup();
  }
}
function TagCreateProbe(available: Tag[]) {
  return useTagTargetCreate({
    available,
    disabled: false,
    onSelect: select,
    onExpire: expire,
  });
}
const select = vi.fn();
const expire = vi.fn();
const fetcher = vi.fn();
const tag: Tag = {
  id: 'real-tag',
  displayName: 'Straße',
  imageCount: 3,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
const page = (items: Tag[], total = items.length, pageNumber = 1): TagPage => ({
  items,
  total,
  page: pageNumber,
  pageSize: 80,
});
let harness: Harness;
beforeEach(() => {
  harness = new Harness();
  select.mockReset();
  expire.mockReset();
  fetcher.mockReset();
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  harness.unmount();
  vi.unstubAllGlobals();
});

it.each([
  [' STRASSE ', 'Straße'],
  ['Cafe\u0301', 'Café'],
  ['ς', 'Σ'],
])(
  'uses the actual Unicode matching rule for %s and offers an explicit existing choice',
  async (input, saved) => {
    const existing = { ...tag, displayName: saved };
    harness.render([existing]).change(input);
    await harness.render([existing]).create();
    expect(harness.render([existing])).toMatchObject({
      name: input,
      duplicate: existing,
      error: expect.stringContaining('已有同名标签'),
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    harness.render([existing]).selectExisting();
    expect(select).toHaveBeenCalledWith(existing);
    expect(harness.render([existing]).name).toBe('');
  },
);

it('does not collapse full-width compatibility characters and selects a truly created tag', async () => {
  const created = { ...tag, displayName: 'ＦＯＯ' };
  fetcher.mockResolvedValue(Response.json({ tag: created, reused: false }));
  const available = [{ ...tag, displayName: 'FOO' }];
  harness.render(available).change(' ＦＯＯ ');
  await harness.render(available).create();
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ name: 'ＦＯＯ' });
  expect(select).toHaveBeenCalledWith(created);
  expect(harness.render(available)).toMatchObject({
    name: '',
    pending: false,
    notice: '已创建并选中“ＦＯＯ”',
  });
});

it('a duplicate outside the loaded page uses the server reuse result without claiming creation or auto-selecting it', async () => {
  fetcher.mockResolvedValue(Response.json({ tag, reused: true }));
  harness.render().change('strasse');
  await harness.render().create();
  expect(harness.render()).toMatchObject({
    name: 'strasse',
    duplicate: tag,
    error: expect.stringContaining('已有同名标签'),
  });
  expect(select).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('searches every real result page when confirming an uncertain creation', async () => {
  fetcher
    .mockResolvedValueOnce(
      Response.json(page([{ ...tag, displayName: 'strasse-prefix' }], 81)),
    )
    .mockResolvedValueOnce(Response.json(page([tag], 81, 2)));
  expect(await findTagTarget('STRASSE', new AbortController().signal)).toEqual(
    tag,
  );
  expect(
    fetcher.mock.calls.map(([url]) =>
      new URL(String(url), 'https://example.com').searchParams.get('page'),
    ),
  ).toEqual(['1', '2']);
});

it('a lost POST response is followed by GET only, preserving the draft until the actual existing tag is selected', async () => {
  fetcher
    .mockRejectedValueOnce(new Error('响应丢失'))
    .mockResolvedValueOnce(Response.json(page([tag])));
  harness.render().change('STRASSE');
  await harness.render().create();
  expect(fetcher.mock.calls.map(([, init]) => init.method ?? 'GET')).toEqual([
    'POST',
    'GET',
  ]);
  expect(harness.render()).toMatchObject({
    name: 'STRASSE',
    unknown: false,
    duplicate: tag,
  });
  expect(select).not.toHaveBeenCalled();
});

it('failed confirmation keeps the original input and prevents another POST until an explicit GET resolves it', async () => {
  fetcher
    .mockRejectedValueOnce(new Error('响应丢失'))
    .mockRejectedValueOnce(new Error('仍未连接'));
  harness.render().change('草稿');
  await harness.render().create();
  expect(harness.render()).toMatchObject({
    name: '草稿',
    unknown: true,
    error: expect.stringContaining('仍未连接'),
  });
  await harness.render().create();
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockResolvedValueOnce(Response.json(page([])));
  await harness.render().check();
  expect(fetcher.mock.calls.map(([, init]) => init.method ?? 'GET')).toEqual([
    'POST',
    'GET',
    'GET',
  ]);
  expect(harness.render()).toMatchObject({
    name: '草稿',
    unknown: false,
    error: expect.stringContaining('可再次创建'),
  });
});

it('keeps a known error editable and aborts a pending creation on unmount without selecting its late response', async () => {
  fetcher.mockResolvedValueOnce(
    Response.json({ message: '名称不可用' }, { status: 400 }),
  );
  harness.render().change('保留输入');
  await harness.render().create();
  expect(harness.render()).toMatchObject({
    name: '保留输入',
    error: '名称不可用',
    unknown: false,
  });
  let resolve!: (value: Response) => void;
  fetcher.mockReturnValueOnce(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  const pending = harness.render().create();
  await harness.render().create();
  expect(fetcher).toHaveBeenCalledTimes(2);
  const signal = fetcher.mock.calls[1][1].signal;
  harness.unmount();
  expect(signal.aborted).toBe(true);
  resolve(Response.json({ tag, reused: false }));
  await pending;
  expect(select).not.toHaveBeenCalled();
});
