import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DependencyList, EffectCallback } from 'react';
import type { Share } from '../../../src/app/shares/api';
import { useSettings } from '../../../src/app/shares/use-settings';

const runtime = vi.hoisted(() => ({ current: null as Harness | null }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => runtime.current!.state(initial),
  useRef: (initial: unknown) => runtime.current!.ref(initial),
  useEffect: (effect: EffectCallback, deps?: DependencyList) =>
    runtime.current!.effect(effect, deps),
  useCallback: (callback: unknown) => callback,
}));
const notifications = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { close: vi.fn() }),
}));
vi.mock('@heroui/react/toast', () => notifications);
class Harness {
  cells: unknown[] = [];
  cursor = 0;
  cleanups = new Map<number, () => void>();
  constructor(readonly initial: Share | null = null) {}
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
  render() {
    this.cursor = 0;
    runtime.current = this;
    return SettingsProbe(this.initial);
  }
  unmount() {
    for (const cleanup of this.cleanups.values()) cleanup();
  }
}
function SettingsProbe(initial: Share | null) {
  return useSettings(initial, 'album', 'UTC', expire, returnPage);
}
const fetcher = vi.fn();
const expire = vi.fn();
const returnPage = vi.fn();
const share: Share = {
  id: 'share',
  albumId: 'album',
  albumName: '真实相册',
  token: 'token',
  url: 'https://example.com/s/token',
  enabled: true,
  hasPassword: false,
  expiresAt: null,
  layout: 'grid',
  showName: false,
  state: 'enabled',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
let harness: Harness;
beforeEach(() => {
  harness = new Harness();
  fetcher.mockReset();
  expire.mockReset();
  returnPage.mockReset();
  notifications.toast.mockReset();
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback());
  vi.stubGlobal('document', {
    activeElement: { isConnected: true, matches: () => false, focus: vi.fn() },
  });
});
afterEach(() => {
  harness.unmount();
  vi.unstubAllGlobals();
});

it('entering an unshared album exposes editable state without requesting creation; pristine return does not write', () => {
  expect(harness.render()).toMatchObject({
    share: null,
    password: '',
    expiry: { mode: 'forever' },
    modalOpen: false,
  });
  harness.render().returnPage();
  expect(returnPage).toHaveBeenCalledTimes(1);
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(['password', 'expiry', 'showName'] as const)(
  'returning with an unsaved first-create %s requires confirmation and cancellation preserves the draft',
  (field) => {
    if (field === 'password') harness.render().setPassword('保留密码');
    else if (field === 'showName') harness.render().setShowName(true);
    else
      harness.render().setExpiry({ ...harness.render().expiry, mode: 'date' });
    harness.render().returnPage();
    expect(harness.render()).toMatchObject({
      modal: 'discard',
      modalOpen: true,
    });
    harness.render().close();
    expect(harness.render().modalOpen).toBe(false);
    expect(returnPage).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    if (field === 'password')
      expect(harness.render().password).toBe('保留密码');
    else if (field === 'showName') expect(harness.render().showName).toBe(true);
    else expect(harness.render().expiry.mode).toBe('date');
  },
);

it('only explicit creation POSTs the existing fields, with no confirmation modal or display PATCH', async () => {
  harness.render().setPassword('😀'.repeat(65));
  harness.render().setShowName(true);
  fetcher.mockResolvedValueOnce(
    Response.json({ share: { ...share, hasPassword: true, showName: true } }),
  );
  await harness.render().create();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('/api/albums/album/share');
  expect(fetcher.mock.calls[0][1].method).toBe('POST');
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    password: { action: 'set', value: '😀'.repeat(65) },
    expiresAt: null,
    showName: true,
  });
  expect(harness.render()).toMatchObject({
    share: { hasPassword: true },
    password: '',
    modalOpen: false,
  });
});

it('confirmed first creation restores focus to the new settings heading after the submit button is removed', async () => {
  const frames: (() => void)[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) =>
    frames.push(callback),
  );
  const focus = vi.fn();
  const initial = harness.render();
  initial.headingRef.current = { focus } as unknown as HTMLHeadingElement;
  fetcher.mockResolvedValueOnce(Response.json({ share }));
  await initial.create();
  expect(harness.render().share).toEqual(share);
  expect(focus).not.toHaveBeenCalled();
  expect(frames).toHaveLength(1);
  frames[0]();
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
});

it('invalid creation fields stay beside their input and send no POST', async () => {
  harness.render().setPassword('x'.repeat(129));
  await harness.render().create();
  expect(harness.render()).toMatchObject({
    password: 'x'.repeat(129),
    errors: { password: expect.stringContaining('1–128') },
  });
  harness.render().setPassword('');
  harness
    .render()
    .setExpiry({ ...harness.render().expiry, mode: 'date', value: null });
  await harness.render().create();
  expect(harness.render()).toMatchObject({
    expiry: { mode: 'date', value: null },
    errors: { expiry: expect.stringContaining('请选择') },
  });
  expect(fetcher).not.toHaveBeenCalled();
});

it('a known creation failure keeps the first-create form editable with its password', async () => {
  harness.render().setPassword('保留');
  fetcher.mockResolvedValueOnce(
    Response.json({ message: '暂时不能创建' }, { status: 409 }),
  );
  await harness.render().create();
  expect(harness.render()).toMatchObject({
    share: null,
    password: '保留',
    blocked: false,
    errors: { create: '暂时不能创建' },
  });
});

it('unknown creation reads the existing record without replaying POST or overriding another owner setting', async () => {
  const existing = {
    ...share,
    enabled: false,
    state: 'disabled',
    layout: 'masonry',
    showName: true,
  } as Share;
  harness.render().setPassword('当前输入');
  fetcher
    .mockRejectedValueOnce(new Error('丢失响应'))
    .mockResolvedValueOnce(Response.json({ share: existing }));
  await harness.render().create();
  expect(fetcher.mock.calls.map(([, init]) => init.method ?? 'GET')).toEqual([
    'POST',
    'GET',
  ]);
  expect(harness.render()).toMatchObject({
    share: existing,
    password: '',
    layout: 'masonry',
    showName: true,
    blocked: false,
  });
  expect(notifications.toast).toHaveBeenCalledWith(
    '已读取分享设置',
    expect.any(Object),
  );
});

it('a failed unknown read retains the form and prevents another POST until checking explicitly ends', async () => {
  harness.render().setPassword('不可丢失');
  fetcher
    .mockRejectedValueOnce(new Error('丢失响应'))
    .mockRejectedValueOnce(new Error('核对断线'));
  await harness.render().create();
  expect(harness.render()).toMatchObject({
    share: null,
    password: '不可丢失',
    blocked: true,
    feedback: { retry: true },
  });
  await harness.render().create();
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockResolvedValueOnce(Response.json({ share: null }));
  await harness.render().readResult();
  expect(harness.render().blocked).toBe(true);
  expect(fetcher.mock.calls.map(([, init]) => init.method ?? 'GET')).toEqual([
    'POST',
    'GET',
    'GET',
  ]);
  harness.render().endChecking();
  expect(harness.render()).toMatchObject({
    blocked: false,
    password: '不可丢失',
  });
});

it.each([true, false])(
  'ordinary sharing toggle to %s saves once without opening a dialog',
  async (enabled) => {
    harness = new Harness({ ...share, enabled: !enabled });
    harness.render().setPassword('未保存密码');
    harness.render().setShowName(true);
    fetcher.mockResolvedValueOnce(
      Response.json({ share: { ...share, enabled } }),
    );
    await harness.render().setEnabled(enabled);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].method).toBe('PATCH');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ enabled });
    expect(harness.render()).toMatchObject({
      enabled,
      modalOpen: false,
      blocked: false,
      password: '未保存密码',
      showName: true,
      dirty: true,
    });
    expect(notifications.toast).toHaveBeenCalledWith(
      enabled ? '分享已启用' : '分享已停用',
      expect.any(Object),
    );
  },
);

it('pending toggle retains confirmed state and prevents duplicate writes', async () => {
  harness = new Harness(share);
  let resolve!: (response: Response) => void;
  fetcher.mockImplementationOnce(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const snapshot = harness.render();
  const request = snapshot.setEnabled(false);
  await snapshot.setEnabled(false);
  expect(harness.render()).toMatchObject({
    enabled: true,
    blocked: true,
    enabledSaving: true,
    modalOpen: false,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  resolve(Response.json({ share: { ...share, enabled: false } }));
  await request;
  expect(harness.render()).toMatchObject({
    enabled: false,
    blocked: false,
    enabledSaving: false,
  });
});

it('known toggle failure stays beside the switch with no success toast or dialog', async () => {
  harness = new Harness(share);
  fetcher.mockResolvedValueOnce(
    Response.json({ message: '暂时不能停用' }, { status: 409 }),
  );
  await harness.render().setEnabled(false);
  expect(harness.render()).toMatchObject({
    enabled: true,
    blocked: false,
    modalOpen: false,
    errors: { enabled: '暂时不能停用' },
  });
  expect(notifications.toast).not.toHaveBeenCalled();
});

it.each([200, 409])(
  'ordinary toggle restores its keyboard opener after status %s',
  async (status) => {
    harness = new Harness(share);
    const focus = vi.fn();
    const source = {
      isConnected: true,
      matches: () => false,
      focus,
    } as unknown as HTMLElement;
    fetcher.mockResolvedValueOnce(
      Response.json(
        status === 200
          ? { share: { ...share, enabled: false } }
          : { message: '暂时不能停用' },
        { status },
      ),
    );
    await harness.render().setEnabled(false, source);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  },
);

it('unknown toggle reads back without replaying the write', async () => {
  harness = new Harness(share);
  fetcher
    .mockRejectedValueOnce(new Error('丢失响应'))
    .mockResolvedValueOnce(
      Response.json({ share: { ...share, enabled: false } }),
    );
  await harness.render().setEnabled(false);
  expect(fetcher.mock.calls.map(([, init]) => init.method ?? 'GET')).toEqual([
    'PATCH',
    'GET',
  ]);
  expect(harness.render()).toMatchObject({
    enabled: false,
    blocked: false,
    modalOpen: false,
    feedback: null,
  });
});

it('unconfirmed toggle preserves the record and blocks further writes until readback ends', async () => {
  harness = new Harness(share);
  fetcher
    .mockRejectedValueOnce(new Error('丢失响应'))
    .mockRejectedValueOnce(new Error('读取失败'));
  await harness.render().setEnabled(false);
  await harness.render().setEnabled(false);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(harness.render()).toMatchObject({
    enabled: true,
    blocked: true,
    feedback: { retry: true },
  });
  expect(notifications.toast).not.toHaveBeenCalled();
});

it.each([true, false])(
  'expired sharing, including enabled=%s, requires a new expiry before any write',
  async (enabled) => {
    harness = new Harness({
      ...share,
      enabled,
      expiresAt: '2020-01-01T00:00:00.000Z',
    });
    await harness.render().setEnabled(true);
    expect(fetcher).not.toHaveBeenCalled();
    expect(harness.render()).toMatchObject({
      modal: 'enable-expired',
      modalOpen: true,
      restoreExpiry: { mode: 'forever' },
    });
  },
);

it.each([401, 404])(
  'toggle handles terminal %s without success',
  async (status) => {
    harness = new Harness(share);
    fetcher.mockResolvedValueOnce(
      Response.json({ message: '对象不可用' }, { status }),
    );
    await harness.render().setEnabled(false);
    expect(notifications.toast).not.toHaveBeenCalled();
    if (status === 401) expect(expire).toHaveBeenCalledTimes(1);
    else
      expect(harness.render()).toMatchObject({ missing: true, blocked: true });
  },
);
