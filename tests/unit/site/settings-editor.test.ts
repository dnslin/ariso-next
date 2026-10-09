import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DependencyList, EffectCallback } from 'react';
import { useSiteSettings } from '../../../src/components/site/use-site-settings';
import {
  SiteRequestError,
  type SiteSettingsResponse,
} from '../../../src/components/site/api';

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
  refresh: vi.fn(),
  cache: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('@heroui/react/toast', () => ({ toast: actions.toast }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: actions.refresh }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: actions.cache,
    invalidateQueries: actions.invalidate,
  }),
}));
function SiteSettingsHarness(value: SiteSettingsResponse | null) {
  return useSiteSettings(value);
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
  render(initialValue: SiteSettingsResponse | null = initial) {
    this.cursor = 0;
    runtime.current = this;
    const value = SiteSettingsHarness(initialValue);
    for (const effect of this.pending.splice(0)) effect();
    return value;
  }
  unmount() {
    for (const cleanup of this.cleanups.values()) cleanup();
    this.cleanups.clear();
  }
}
const initial: SiteSettingsResponse = {
  id: 1,
  name: 'Ariso',
  description: '',
  publicUrl: 'https://img.example.com',
  timeZone: 'UTC',
  logoKey: null,
  logoUrl: null,
  logoMime: null,
  faviconKey: null,
  faviconUrl: null,
  faviconMime: null,
  updatedAt: '2026-10-08T00:00:00.000Z',
  githubCallbackUrl: 'https://img.example.com/api/auth/callback/github',
};
let harness: Harness;
const focus = vi.fn();
beforeEach(() => {
  harness = new Harness();
  for (const action of Object.values(actions)) action.mockReset();
  focus.mockReset();
  vi.stubGlobal('fetch', actions.fetch);
  vi.stubGlobal('document', {
    getElementById: () => ({
      focus,
      matches: () => true,
      closest: () => ({ scrollIntoView: vi.fn() }),
    }),
  });
});
afterEach(() => {
  harness.unmount();
  vi.unstubAllGlobals();
});

it('规范化四字段后只提交本组数据，成功刷新品牌与缓存而不导航', async () => {
  harness.render().change('name', '  我的站点  ');
  harness.render().change('publicUrl', 'HTTPS://NEW.EXAMPLE.COM:443/');
  const saved = {
    ...initial,
    name: '我的站点',
    publicUrl: 'https://new.example.com',
    githubCallbackUrl: 'https://new.example.com/api/auth/callback/github',
    publicUrlChanged: true,
    notices: ['地址后果'],
  };
  actions.fetch.mockResolvedValue(Response.json(saved));
  await harness.render().save();
  const request = actions.fetch.mock.calls[0][1];
  expect(request.method).toBe('PATCH');
  expect(JSON.parse(request.body)).toEqual({
    name: '我的站点',
    description: '',
    publicUrl: 'https://new.example.com',
    timeZone: 'UTC',
  });
  expect(harness.render()).toMatchObject({
    saved,
    phase: 'ready',
    originNotice: true,
    locked: false,
  });
  expect(actions.refresh).toHaveBeenCalledTimes(1);
  expect(actions.cache).toHaveBeenCalledWith(['site-settings'], saved);
  expect(actions.toast).toHaveBeenCalledWith('站点信息已保存', {
    variant: 'default',
  });
});

it('无效 IANA 时区保留原输入、定位错误且不发请求', async () => {
  harness.render().change('timeZone', '+08:00');
  await harness.render().save();
  expect(harness.render()).toMatchObject({
    input: { timeZone: '+08:00' },
    errors: { timeZone: expect.any(String) },
    phase: 'ready',
  });
  expect(actions.fetch).not.toHaveBeenCalled();
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  focus.mockClear();
  await harness.render().save();
  harness.render();
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
});

it('明确的 400 字段错误保留草稿并开放修正；401 沿既有会话失效模式停止写入', async () => {
  harness.render().change('name', '未保存名称');
  actions.fetch.mockResolvedValueOnce(
    Response.json(
      {
        code: 'SITE_INVALID_INPUT',
        message: '名称错误',
        fields: [{ field: 'name', message: '请输入名称' }],
      },
      { status: 400 },
    ),
  );
  await harness.render().save();
  expect(harness.render()).toMatchObject({
    input: { name: '未保存名称' },
    saved: initial,
    phase: 'ready',
    locked: false,
    errors: { name: '请输入名称' },
  });
  actions.fetch.mockResolvedValueOnce(
    Response.json(
      { code: 'UNAUTHORIZED', message: '请重新登录' },
      { status: 401 },
    ),
  );
  await harness.render().save();
  expect(harness.render()).toMatchObject({ expired: true, locked: true });
  await harness.render().save();
  expect(actions.fetch).toHaveBeenCalledTimes(2);
});

it.each(['network', '500'])(
  '保存 %s 结果未知时只读核对，确认匹配后保留输入且不重复 PATCH',
  async (kind) => {
    harness.render().change('name', '  待核对  ');
    if (kind === 'network')
      actions.fetch.mockRejectedValueOnce(new Error('网络中断'));
    else
      actions.fetch.mockResolvedValueOnce(
        Response.json({ message: '服务异常' }, { status: 500 }),
      );
    await harness.render().save();
    expect(harness.render()).toMatchObject({
      phase: 'unknown',
      locked: true,
      saved: initial,
      input: { name: '  待核对  ' },
    });
    await harness.render().save();
    expect(actions.fetch).toHaveBeenCalledTimes(1);
    actions.fetch.mockResolvedValueOnce(
      Response.json({
        ...initial,
        name: '待核对',
        updatedAt: '2026-10-08T01:00:00.000Z',
      }),
    );
    await harness.render().reconcile();
    expect(actions.fetch.mock.calls[1][1]).not.toHaveProperty('method');
    expect(harness.render()).toMatchObject({
      phase: 'confirmed',
      locked: false,
      input: { name: '  待核对  ' },
      saved: { name: '待核对' },
    });
    expect(actions.toast).not.toHaveBeenCalled();
  },
);

it.each([true, false])(
  '核对差异明确选择 useSaved=%s，期间不能写入且地址只展示服务器值',
  async (useSaved) => {
    harness.render().change('publicUrl', 'https://draft.example.com');
    actions.fetch.mockRejectedValueOnce(new Error('响应丢失'));
    await harness.render().save();
    const saved = {
      ...initial,
      publicUrl: 'https://server.example.com',
      githubCallbackUrl: 'https://server.example.com/api/auth/callback/github',
    };
    actions.fetch.mockResolvedValueOnce(Response.json(saved));
    await harness.render().reconcile();
    expect(harness.render()).toMatchObject({
      phase: 'different',
      locked: true,
      saved,
      originNotice: true,
    });
    await harness.render().save();
    expect(actions.fetch).toHaveBeenCalledTimes(2);
    harness.render().chooseSaved(useSaved);
    expect(harness.render()).toMatchObject({
      phase: 'ready',
      locked: false,
      input: {
        publicUrl: useSaved ? saved.publicUrl : 'https://draft.example.com',
      },
      saved,
    });
  },
);

it('核对失败保持锁定，重试仍然只 GET，不把旧快照当作服务器读取结果', async () => {
  harness.render().change('name', '草稿');
  actions.fetch.mockRejectedValueOnce(new Error('断网'));
  await harness.render().save();
  actions.fetch.mockRejectedValueOnce(new Error('仍断网'));
  await harness.render().reconcile();
  expect(harness.render()).toMatchObject({
    phase: 'check-error',
    locked: true,
    saved: initial,
  });
  actions.fetch.mockResolvedValueOnce(Response.json(initial));
  await harness.render().reconcile();
  expect(harness.render().phase).toBe('different');
  expect(
    actions.fetch.mock.calls.map((call) => call[1].method ?? 'GET'),
  ).toEqual(['PATCH', 'GET', 'GET']);
});

it('卸载时取消在途请求，迟到成功不能更新缓存或旧页面', async () => {
  let resolve!: (response: Response) => void;
  actions.fetch.mockReturnValue(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  const saving = harness.render().save();
  const signal = actions.fetch.mock.calls[0][1].signal as AbortSignal;
  harness.unmount();
  expect(signal.aborted).toBe(true);
  resolve(Response.json(initial));
  await saving;
  expect(actions.cache).not.toHaveBeenCalled();
  expect(actions.refresh).not.toHaveBeenCalled();
  expect(actions.toast).not.toHaveBeenCalled();
});

it('HTTP 请求错误保留稳定状态、代码与字段信息', () => {
  const error = new SiteRequestError(400, {
    code: 'SITE_INVALID_INPUT',
    message: '地址错误',
    fields: [{ field: 'publicUrl', message: '仅支持根地址' }],
  });
  expect(error).toMatchObject({
    status: 400,
    code: 'SITE_INVALID_INPUT',
    message: '地址错误',
    fields: [{ field: 'publicUrl', message: '仅支持根地址' }],
  });
});

it('初次读取前不允许保存，成功读取只初始化一次且后续快照不覆盖草稿', async () => {
  expect(harness.render(null).saved).toBeNull();
  expect(harness.render(null).locked).toBe(true);
  await harness.render(null).save();
  expect(actions.fetch).not.toHaveBeenCalled();
  harness.render(initial);
  expect(harness.render(initial).input).toMatchObject({
    name: initial.name,
    publicUrl: initial.publicUrl,
  });
  harness.render(initial).change('name', '保留编辑');
  const later = { ...initial, name: '迟到快照' };
  expect(harness.render(later).input.name).toBe('保留编辑');
  expect(harness.render(later).saved).toEqual(initial);
});
it('初次读取前失效时，迟到快照不能解除锁定或初始化编辑值', () => {
  harness.render(null).expire();
  expect(harness.render(initial)).toMatchObject({
    saved: null,
    expired: true,
    locked: true,
  });
});
