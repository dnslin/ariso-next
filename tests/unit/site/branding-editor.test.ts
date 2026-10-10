import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DependencyList, EffectCallback } from 'react';
import { useBranding } from '../../../src/components/site/use-branding';
import type { BrandSettings } from '../../../src/components/site/branding-api';

// Retain real hook state and deliver lifecycle cleanup; browser DOM acceptance
// remains in the general settings scenario, not this harness.
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
  toast: vi.fn(),
  closeToast: vi.fn(),
  refresh: vi.fn(),
  cache: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('@heroui/react/toast', () => ({
  toast: Object.assign(actions.toast, { close: actions.closeToast }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: actions.refresh }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: actions.cache,
    invalidateQueries: actions.invalidate,
  }),
}));
function BrandingHarness(value: BrandSettings | null) {
  return useBranding(value);
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
  render(initialValue: BrandSettings | null = initial) {
    this.cursor = 0;
    runtime.current = this;
    const value = BrandingHarness(initialValue);
    for (const effect of this.pending.splice(0)) effect();
    return value;
  }
  unmount() {
    for (const cleanup of this.cleanups.values()) cleanup();
    this.cleanups.clear();
  }
}
const initial: BrandSettings = {
  name: 'Ariso',
  description: 'brand',
  logoUrl: '/branding/old.svg',
  logoMime: 'image/svg+xml',
  faviconUrl: null,
  faviconMime: null,
};
let harness: Harness;
const file = new File(
  ['<svg xmlns="http://www.w3.org/2000/svg"/>'],
  'brand.svg',
  { type: 'image/svg+xml' },
);
beforeEach(() => {
  harness = new Harness();
  for (const action of Object.values(actions)) action.mockReset();
  vi.stubGlobal('fetch', actions.fetch);
});
afterEach(() => {
  harness.unmount();
  vi.unstubAllGlobals();
});

it('只发送本次所选File，成功更新指定素材而不覆盖文本/另一素材，不导航', async () => {
  harness.render().select('logo', file);
  actions.fetch.mockResolvedValue(
    Response.json({ url: '/branding/new.svg', mime: 'image/svg+xml' }),
  );
  await harness.render().save();
  const [url, request] = actions.fetch.mock.calls[0];
  expect(url).toBe('/api/settings/site/branding/logo');
  expect(request.method).toBe('PUT');
  expect([...request.body.keys()]).toEqual(['file']);
  expect(request.body.get('file')).toBe(file);
  expect(harness.render()).toMatchObject({
    saved: { ...initial, logoUrl: '/branding/new.svg' },
    operation: null,
    locked: false,
  });
  expect(actions.refresh).toHaveBeenCalledTimes(1);
  expect(actions.invalidate).toHaveBeenCalledWith({
    queryKey: ['site-branding'],
  });
  expect(actions.invalidate).toHaveBeenCalledWith({
    queryKey: ['site-settings'],
  });
  expect(actions.toast).toHaveBeenCalledWith('Logo 已更新', {
    variant: 'default',
  });
});
it.each(['save', 'reconcile'])(
  '%s成功后下一次操作只关闭本编辑器的上一条通知，避免遮挡确认操作',
  async (mode) => {
    actions.toast.mockReturnValueOnce('brand-success-id');
    harness.render().select('logo', null);
    if (mode === 'save') {
      actions.fetch.mockResolvedValueOnce(
        Response.json({ url: null, mime: null }),
      );
      await harness.render().save();
    } else {
      actions.fetch.mockRejectedValueOnce(new Error('响应丢失'));
      await harness.render().save();
      actions.fetch.mockResolvedValueOnce(
        Response.json({ ...initial, logoUrl: null, logoMime: null }),
      );
      await harness.render().reconcile();
    }
    expect(actions.closeToast).not.toHaveBeenCalled();
    harness.render().select('favicon', file);
    expect(actions.closeToast.mock.calls).toEqual([['brand-success-id']]);
    harness.render().cancel();
    harness.render().select('favicon', null);
    expect(actions.closeToast).toHaveBeenCalledTimes(1);
  },
);
it('明确拒绝保留原引用和同一File，取消只丢弃选择而不写入', async () => {
  harness.render().select('logo', file);
  actions.fetch.mockResolvedValue(
    Response.json({ message: '静态SVG无效' }, { status: 400 }),
  );
  await harness.render().save();
  expect(harness.render()).toMatchObject({
    phase: 'failed',
    saved: initial,
    locked: false,
    operation: { file },
  });
  expect(harness.render().operation!.file).toBe(file);
  harness.render().cancel();
  expect(harness.render().operation).toBeNull();
  expect(actions.fetch).toHaveBeenCalledTimes(1);
});
it.each(['network', '500'])(
  '上传%s结果未知时不自动写回，GET改变URL也不证明File已保存',
  async (mode) => {
    harness.render().select('logo', file);
    if (mode === 'network')
      actions.fetch.mockRejectedValueOnce(new Error('响应丢失'));
    else
      actions.fetch.mockResolvedValueOnce(
        Response.json({ message: '失败' }, { status: 500 }),
      );
    await harness.render().save();
    expect(harness.render()).toMatchObject({
      phase: 'unknown',
      locked: true,
      operation: { file },
      saved: initial,
    });
    harness.render().cancel();
    harness.render().select('favicon', file);
    await harness.render().save();
    expect(actions.fetch).toHaveBeenCalledTimes(1);
    actions.fetch.mockResolvedValueOnce(
      Response.json({ ...initial, logoUrl: '/branding/another.svg' }),
    );
    await harness.render().reconcile();
    expect(harness.render()).toMatchObject({
      phase: 'different',
      locked: true,
      saved: { logoUrl: '/branding/another.svg' },
    });
    expect(harness.render().operation!.file).toBe(file);
    expect(actions.fetch.mock.calls[1][0]).toBe('/api/settings/site');
    expect(actions.fetch.mock.calls[1][1].method).toBeUndefined();
    await harness.render().save();
    expect(actions.fetch).toHaveBeenCalledTimes(2);
    harness.render().retry();
    expect(harness.render()).toMatchObject({
      phase: 'selected',
      locked: false,
      operation: { file },
    });
    expect(actions.fetch).toHaveBeenCalledTimes(2);
  },
);
it('采用服务器素材清除选择，不再PUT；读取失败不能用旧快照解除锁定', async () => {
  harness.render().select('logo', file);
  actions.fetch.mockRejectedValueOnce(new Error('断开'));
  await harness.render().save();
  actions.fetch.mockRejectedValueOnce(new Error('仍断开'));
  await harness.render().reconcile();
  expect(harness.render()).toMatchObject({
    phase: 'check-error',
    saved: initial,
    locked: true,
  });
  harness.render().useServer();
  expect(harness.render().operation!.file).toBe(file);
  actions.fetch.mockResolvedValueOnce(
    Response.json({ ...initial, logoUrl: null, logoMime: null }),
  );
  await harness.render().reconcile();
  harness.render().useServer();
  expect(harness.render()).toMatchObject({
    operation: null,
    locked: false,
    saved: { logoUrl: null },
  });
  expect(actions.fetch.mock.calls.map((c) => c[1].method ?? 'GET')).toEqual([
    'PUT',
    'GET',
    'GET',
  ]);
});
it.each([null, '/branding/current.svg'])(
  '删除未知读回%s：无引用才完成，有引用需显式再次移除',
  async (url) => {
    harness.render().select('logo', null);
    actions.fetch.mockRejectedValueOnce(new Error('断开'));
    await harness.render().save();
    actions.fetch.mockResolvedValueOnce(
      Response.json({ ...initial, logoUrl: url }),
    );
    await harness.render().reconcile();
    if (url === null) expect(harness.render().operation).toBeNull();
    else {
      expect(harness.render()).toMatchObject({
        phase: 'different',
        locked: true,
      });
      actions.fetch.mockResolvedValueOnce(
        Response.json({ url: null, mime: null }),
      );
      await harness.render().save();
      expect(actions.fetch).toHaveBeenCalledTimes(2);
      await harness.render().save(true);
      expect(actions.fetch.mock.calls[2][1].method).toBe('DELETE');
      expect(harness.render().operation).toBeNull();
    }
  },
);
it('401和会话失效阻止迟到结果、重复提交及核对，保留File', async () => {
  harness.render().select('logo', file);
  actions.fetch.mockResolvedValueOnce(
    Response.json({ message: '请登录' }, { status: 401 }),
  );
  await harness.render().save();
  expect(harness.render()).toMatchObject({
    expired: true,
    phase: 'unknown',
    busy: false,
    locked: true,
    operation: { file },
  });
  await harness.render().save(true);
  await harness.render().reconcile();
  expect(actions.fetch).toHaveBeenCalledTimes(1);
  expect(actions.cache).not.toHaveBeenCalled();
});
it.each([true, false])(
  '卸载=%s取消在途请求，迟到成功不能更新缓存或反馈',
  async (unmount) => {
    let resolve!: (value: Response) => void;
    harness.render().select('logo', file);
    actions.fetch.mockReturnValueOnce(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    const saving = harness.render().save();
    const signal = actions.fetch.mock.calls[0][1].signal as AbortSignal;
    await harness.render().save();
    expect(actions.fetch).toHaveBeenCalledTimes(1);
    if (unmount) harness.unmount();
    else harness.render().expire();
    if (!unmount)
      expect(harness.render()).toMatchObject({
        expired: true,
        busy: false,
        phase: 'unknown',
      });
    expect(signal.aborted).toBe(true);
    resolve(
      Response.json({ url: '/branding/late.svg', mime: 'image/svg+xml' }),
    );
    await saving;
    expect(actions.cache).not.toHaveBeenCalled();
    expect(actions.refresh).not.toHaveBeenCalled();
    expect(actions.toast).not.toHaveBeenCalled();
  },
);

it('新服务器快照同步名称和另一素材，不丢失已选File；后续无新值不抹去确定引用', () => {
  harness.render().select('logo', file);
  const current = {
    ...initial,
    name: '其他标签的新名称',
    description: '最新描述',
    faviconUrl: '/branding/icon.png',
    faviconMime: 'image/png',
  };
  harness.render(current);
  const editor = harness.render(current);
  expect(editor.saved).toEqual(current);
  expect(editor.operation!.file).toBe(file);
  expect(editor.operation!.previewUrl).toMatch(/^blob:/);
  harness.render(null);
  expect(harness.render(null)).toMatchObject({
    saved: current,
    phase: 'selected',
    operation: { file },
  });
});
