import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  DependencyList,
  EffectCallback,
  FocusEvent,
  InputEvent,
} from 'react';
import { useProcessingSettings } from '../../../src/components/processing/use-processing-settings';
import { useSmtpPage } from '../../../src/components/identity/use-smtp-page';
import { initialMediaSettings } from '../../../src/server/media/validation';
import { ProcessingRequestError } from '../../../src/components/processing/api';

const runtime = vi.hoisted(() => ({ current: null as Hooks | null }));
const actions = vi.hoisted(() => ({
  push: vi.fn(),
  media: vi.fn(),
  smtpRead: vi.fn(),
  smtpSave: vi.fn(),
  smtpTest: vi.fn(),
  cache: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => runtime.current!.state(initial),
  useRef: (initial: unknown) => runtime.current!.ref(initial),
  useCallback: (callback: unknown, deps: DependencyList) =>
    runtime.current!.callback(callback, deps),
  useEffect: (effect: EffectCallback, deps?: DependencyList) =>
    runtime.current!.effect(effect, deps),
  useLayoutEffect: (effect: EffectCallback, deps?: DependencyList) =>
    runtime.current!.effect(effect, deps),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: actions.push }),
}));
vi.mock('@heroui/react/toast', () => ({ toast: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: actions.cache,
    invalidateQueries: actions.invalidate,
  }),
}));
vi.mock('../../../src/components/upload/provider', () => ({
  useUploadQueue: () => ({ client: { invalidateQueries: actions.invalidate } }),
}));
vi.mock('../../../src/components/processing/api', async (original) => ({
  ...(await original<
    typeof import('../../../src/components/processing/api')
  >()),
  processingRequest: actions.media,
}));
vi.mock('../../../src/components/identity/smtp-request', async (original) => ({
  ...(await original<
    typeof import('../../../src/components/identity/smtp-request')
  >()),
  readSmtpSettings: actions.smtpRead,
  saveSmtpSettings: actions.smtpSave,
  testSmtpSettings: actions.smtpTest,
}));

// Deliver real hook state, effects and navigation events. Actual modal animation
// and keyboard focus are checked in the corresponding browser flow.
class Hooks {
  private cells: unknown[] = [];
  private cursor = 0;
  private effects: (() => void)[] = [];
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
  callback(value: unknown, deps: DependencyList) {
    const index = this.cursor++;
    const previous = this.cells[index] as
      { value: unknown; deps: DependencyList } | undefined;
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i])))
      this.cells[index] = { value, deps };
    return (this.cells[index] as { value: unknown }).value;
  }
  effect(effect: EffectCallback, deps?: DependencyList) {
    const index = this.cursor++;
    const previous = this.cells[index] as DependencyList | undefined;
    if (
      !deps ||
      !previous ||
      deps.some((dep, i) => !Object.is(dep, previous[i]))
    ) {
      this.cells[index] = deps;
      this.effects.push(() => {
        this.cleanups.get(index)?.();
        const cleanup = effect();
        if (cleanup) this.cleanups.set(index, cleanup);
      });
    }
  }
  render<T>(component: () => T) {
    this.cursor = 0;
    runtime.current = this;
    const value = component();
    for (const effect of this.effects.splice(0)) effect();
    return value;
  }
  unmount() {
    for (const cleanup of this.cleanups.values()) cleanup();
  }
}
const processingSaved = {
  ...initialMediaSettings,
  id: 1,
  updatedAt: '2026-10-13T00:00:00Z',
};
const smtpSaved = {
  host: 'smtp.internal',
  port: 587,
  mode: 'starttls' as const,
  username: 'owner',
  fromName: 'Ariso',
  fromEmail: 'owner@example.test',
  hasPassword: true,
  updatedAt: '2026-10-13T00:00:00Z',
};
let hooks: Hooks;
let frames: FrameRequestCallback[];
let dom: EventTarget & {
  activeElement: unknown;
  querySelector: ReturnType<typeof vi.fn>;
  getElementById: ReturnType<typeof vi.fn>;
};
const controls = new Map<
  string,
  {
    focus: ReturnType<typeof vi.fn>;
    getClientRects: () => number[];
    hasAttribute: () => boolean;
  }
>();
function control(key: string) {
  const node = {
    focus: vi.fn(() => {
      dom.activeElement = node;
    }),
    getClientRects: () => [1],
    hasAttribute: () => false,
  };
  controls.set(key, node);
  return node;
}
function flushFrames() {
  for (const callback of frames.splice(0)) callback(0);
}
function processing() {
  return hooks.render(() => useProcessingSettings(processingSaved));
}
function smtp() {
  return hooks.render(useSmtpPage);
}
async function smtpReady() {
  smtp();
  await Promise.resolve();
  return smtp();
}
beforeEach(() => {
  hooks = new Hooks();
  frames = [];
  controls.clear();
  for (const action of Object.values(actions)) action.mockReset();
  actions.invalidate.mockResolvedValue(undefined);
  actions.media.mockResolvedValue(processingSaved);
  actions.smtpRead.mockResolvedValue(smtpSaved);
  actions.smtpSave.mockResolvedValue(smtpSaved);
  dom = Object.assign(new EventTarget(), {
    activeElement: null,
    querySelector: vi.fn(),
    getElementById: vi.fn(),
  });
  dom.querySelector.mockImplementation((selector: string) => {
    const key = selector.match(/data-field="([^"]+)"/)?.[1];
    if (key)
      return {
        querySelectorAll: () => (controls.has(key) ? [controls.get(key)] : []),
      };
    const testId = selector.match(/data-testid="smtp-([^"]+)"/)?.[1];
    return testId ? controls.get(testId) : null;
  });
  const navigation = Object.assign(new EventTarget(), { traverseTo: vi.fn() });
  vi.stubGlobal('document', dom);
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      navigation,
      location: {
        pathname: '/settings/processing',
        origin: 'http://localhost',
        search: '',
      },
    }),
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    frames.push(callback),
  );
  vi.stubGlobal('CSS', { escape: (value: string) => value });
});
afterEach(() => {
  hooks.unmount();
  vi.unstubAllGlobals();
});

it('处理质量修改后先确认，继续编辑保留值并回到质量字段；只有放弃才切分类', () => {
  const quality = control('quality');
  processing().change('quality', 73);
  // NumberField commits on blur after focus has already moved to another control.
  dom.activeElement = control('maxEdge');
  processing().navigation.navigate('/settings/email');
  expect(actions.push).not.toHaveBeenCalled();
  expect(processing().navigation.destination).toBe('/settings/email');
  processing().navigation.cancel();
  flushFrames();
  expect(processing().input.quality).toBe(73);
  expect(dom.activeElement).toBe(quality);
  processing().navigation.navigate('/settings/email');
  processing().navigation.discard();
  expect(actions.push).toHaveBeenCalledExactlyOnceWith('/settings/email');
});

it.each([
  ['quality', '82', '73'],
  ['jpegBackground', '#FFFFFF', '#12'],
])(
  '未提交的 %s 原始输入也保护浏览器离开，恢复原值后解除提示',
  (field, baseline, edited) => {
    const target = Object.assign(control(field), {
      value: baseline,
      matches: () => true,
      closest: () => ({ dataset: { field } }),
    });
    const focus = { target } as unknown as FocusEvent<HTMLDivElement>;
    const input = { target } as unknown as InputEvent<HTMLDivElement>;
    processing().formEvents?.onFocusCapture(focus);
    target.value = edited;
    processing().formEvents?.onInput(input);
    // The NumberField/ColorField callback has not committed a model value yet.
    expect(processing().input[field as 'quality' | 'jpegBackground']).toBe(
      field === 'quality' ? 82 : '#FFFFFF',
    );
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    const back = Object.assign(new Event('navigate', { cancelable: true }), {
      navigationType: 'traverse',
      hashChange: false,
      destination: { key: 'previous-settings', sameDocument: true },
    });
    window.navigation.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    expect(processing().navigation.destination).toEqual({
      key: 'previous-settings',
    });
    processing().navigation.cancel();
    flushFrames();
    expect(dom.activeElement).toBe(target);
    expect(target.value).toBe(edited);

    target.value = baseline;
    processing().formEvents?.onInput(input);
    processing();
    const restored = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(restored);
    expect(restored.defaultPrevented).toBe(false);
    processing().formEvents?.onBlurCapture(focus);
    processing().navigation.navigate('/settings/email');
    expect(actions.push).toHaveBeenCalledExactlyOnceWith('/settings/email');
  },
);

it.each([
  ['quality', '82', '73', false],
  ['jpegBackground', '#FFFFFF', '#123456', true],
  ['watermarkText', 'A', 'B', true],
] as const)(
  '%s 跨聚焦恢复已保存值不再拦截，其他未保存字段仍受保护',
  (field, baseline, edited, immediate) => {
    const editor = () =>
      hooks.render(() =>
        useProcessingSettings({
          ...processingSaved,
          watermarkMode: 'text',
          watermarkText: 'A',
        }),
      );
    const target = Object.assign(control(field), {
      value: baseline as string,
      matches: (selector: string) =>
        field === 'watermarkText'
          ? selector.includes('textarea')
          : selector.includes('input'),
      closest: () => ({ dataset: { field } }),
    });
    const focus = { target } as unknown as FocusEvent<HTMLDivElement>;
    const input = { target } as unknown as InputEvent<HTMLDivElement>;
    const setValue = (text: string) => {
      if (field === 'quality') editor().change(field, Number(text));
      else editor().change(field, text);
    };
    editor().formEvents.onFocusCapture(focus);
    target.value = edited;
    editor().formEvents.onInput(input);
    setValue(edited);
    editor().formEvents.onBlurCapture(focus);
    editor().formEvents.onFocusCapture(focus);
    target.value = baseline;
    editor().formEvents.onInput(input);
    if (immediate) setValue(baseline);
    editor();
    const restored = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(restored);
    expect(restored.defaultPrevented).toBe(false);
    editor().change('concurrency', 2);
    editor();
    const otherDirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(otherDirty);
    expect(otherDirty.defaultPrevented).toBe(true);
  },
);

it('处理值恢复原值后直接离开，已保存修改也不重复确认', async () => {
  processing().change('quality', 73);
  processing().change('quality', 82);
  processing().navigation.navigate('/settings/email');
  expect(actions.push).toHaveBeenCalledWith('/settings/email');
  actions.push.mockClear();
  processing().change('quality', 73);
  actions.media.mockResolvedValue({ ...processingSaved, quality: 73 });
  await processing().save();
  processing().navigation.navigate('/settings/email');
  expect(actions.push).toHaveBeenCalledExactlyOnceWith('/settings/email');
});

it('处理设置保存中、结果未知和核对中保持原有离开路径，明确失败仍保护输入', async () => {
  processing().change('quality', 73);
  let reject!: (reason: Error) => void;
  actions.media.mockReturnValueOnce(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  const saving = processing().save();
  processing().navigation.navigate('/settings/email');
  expect(actions.push).toHaveBeenCalledTimes(1);
  reject(new Error('connection interrupted'));
  await saving;
  processing().navigation.navigate('/settings/email');
  expect(actions.push).toHaveBeenCalledTimes(2);
  let resolve!: (value: typeof processingSaved) => void;
  actions.media.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const checking = processing().reconcile();
  processing().navigation.navigate('/settings/email');
  expect(actions.push).toHaveBeenCalledTimes(3);
  resolve(processingSaved);
  await checking;
  processing().chooseSaved(false);
  actions.media.mockRejectedValueOnce(
    new ProcessingRequestError(400, { message: '参数未保存' }),
  );
  await processing().save();
  processing().navigation.navigate('/settings/email');
  expect(actions.push).toHaveBeenCalledTimes(3);
  expect(processing().input.quality).toBe(73);
});

it('SMTP 主机编辑先确认，取消保留输入并恢复主机焦点，放弃才离开', async () => {
  await smtpReady();
  const host = control('host');
  smtp().change('host', 'smtp.photos.example');
  dom.activeElement = control('port');
  smtp().navigation.navigate('/settings/general');
  expect(actions.push).not.toHaveBeenCalled();
  smtp().navigation.cancel();
  flushFrames();
  expect(smtp().draft.host).toBe('smtp.photos.example');
  expect(dom.activeElement).toBe(host);
  smtp().navigation.navigate('/settings/general');
  smtp().navigation.discard();
  expect(actions.push).toHaveBeenCalledExactlyOnceWith('/settings/general');
});

it('未配置 SMTP 时仅改端口或连接方式也属于未提交编辑，恢复默认后直接离开', async () => {
  actions.smtpRead.mockResolvedValue(null);
  await smtpReady();
  smtp().change('port', 465);
  smtp().navigation.navigate('/settings/general');
  expect(actions.push).not.toHaveBeenCalled();
  smtp().navigation.cancel();
  smtp().change('port', 587);
  smtp().change('mode', 'tls');
  smtp().navigation.navigate('/settings/general');
  expect(actions.push).not.toHaveBeenCalled();
  smtp().navigation.cancel();
  smtp().change('mode', 'starttls');
  smtp().navigation.navigate('/settings/general');
  expect(actions.push).toHaveBeenCalledExactlyOnceWith('/settings/general');
});

it('SMTP 保存中与结果核对期间不新增离开拦截，正常保存后也直接离开', async () => {
  await smtpReady();
  smtp().change('fromName', '更新名称');
  let reject!: (reason: Error) => void;
  actions.smtpSave.mockReturnValueOnce(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  let resolve!: (value: typeof smtpSaved) => void;
  actions.smtpRead.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const saving = smtp().save();
  smtp().navigation.navigate('/settings/general');
  expect(actions.push).toHaveBeenCalledTimes(1);
  reject(new Error('response interrupted'));
  await Promise.resolve();
  smtp().navigation.navigate('/settings/general');
  expect(actions.push).toHaveBeenCalledTimes(2);
  resolve(smtpSaved);
  await saving;
  smtp().navigation.navigate('/settings/general');
  expect(actions.push).toHaveBeenCalledTimes(3);
  smtp().resume(false);
  actions.smtpSave.mockResolvedValue({ ...smtpSaved, fromName: '更新名称' });
  await smtp().save();
  smtp().navigation.navigate('/settings/general');
  expect(actions.push).toHaveBeenCalledTimes(4);
});
