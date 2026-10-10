import { afterEach, expect, it, vi } from 'vitest';
import type { DependencyList, EffectCallback } from 'react';
import { useSmtpPage } from '../../../src/components/identity/use-smtp-page';

// Preserve hook state and explicitly deliver commits/frames. Real DOM keyboard
// behavior remains covered by the corresponding browser scenario.
const runtime = vi.hoisted(() => ({ current: null as Hooks | null }));
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
vi.mock('@heroui/react/toast', () => ({ toast: vi.fn() }));
const requests = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  test: vi.fn(),
}));
vi.mock('../../../src/components/identity/smtp-request', async (original) => ({
  ...(await original<
    typeof import('../../../src/components/identity/smtp-request')
  >()),
  readSmtpSettings: requests.read,
  saveSmtpSettings: requests.save,
  testSmtpSettings: requests.test,
}));

class Hooks {
  private cells: unknown[] = [];
  private cursor = 0;
  private effects: EffectCallback[] = [];
  state(initial: unknown) {
    const index = this.cursor++;
    if (!(index in this.cells))
      this.cells[index] = typeof initial === 'function' ? initial() : initial;
    return [
      this.cells[index],
      (next: unknown) => {
        this.cells[index] =
          typeof next === 'function' ? next(this.cells[index]) : next;
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
      this.effects.push(effect);
    }
  }
  render<T>(component: () => T, commit: (editor: T) => void) {
    this.cursor = 0;
    runtime.current = this;
    const editor = component();
    commit(editor);
    for (const effect of this.effects.splice(0)) effect();
    return editor;
  }
}

const saved = {
  host: 'smtp.internal',
  port: 587,
  mode: 'starttls' as const,
  username: 'owner',
  fromName: 'Ariso',
  fromEmail: 'owner@example.test',
  hasPassword: true,
  updatedAt: '2026-10-10T00:00:00Z',
};
async function smtp() {
  requests.read.mockReset().mockResolvedValue(saved);
  requests.save.mockReset().mockResolvedValue({ ...saved, fromName: '已保存' });
  requests.test.mockReset();
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    frames.push(callback),
  );
  const dom = {
    activeElement: null as object | null,
    querySelector: vi.fn(),
    getElementById: vi.fn(),
  };
  function element(id: string) {
    const node = {
      id,
      disabled: false,
      focus: vi.fn(() => {
        dom.activeElement = node;
      }),
    };
    return node;
  }
  const save = element('smtp-save');
  const test = element('smtp-test');
  const heading = element('smtp-heading');
  dom.querySelector.mockImplementation((selector: string) => {
    const node = selector.includes('smtp-save')
      ? save
      : selector.includes('smtp-test')
        ? test
        : null;
    return selector.includes(':not(:disabled)') && node?.disabled ? null : node;
  });
  dom.getElementById.mockReturnValue(heading);
  vi.stubGlobal('document', dom);
  const hooks = new Hooks();
  const render = () =>
    hooks.render(useSmtpPage, (editor) => {
      save.disabled = editor.locked || !editor.changed;
      test.disabled = editor.locked || !editor.saved;
    });
  render();
  await Promise.resolve();
  render();
  return {
    render,
    dom,
    save,
    test,
    heading,
    flushFrames: () => {
      for (const frame of frames.splice(0)) frame(0);
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

it('does not let an old save-completion frame steal the next test action focus', async () => {
  const page = await smtp();
  page.render().change('fromName', '已保存');
  const saving = page.render().save();
  expect(page.render().operation).toBe('saving');
  await saving;
  expect(page.render().operation).toBe('idle');
  page.render().change('fromName', '尚未保存');
  expect(page.render().changed).toBe(true);
  page.test.focus();
  page.flushFrames();
  expect(page.dom.activeElement).toBe(page.test);
  page.render().test();
  expect(page.render().dialog).toBe('test-confirm');
  expect(requests.test).not.toHaveBeenCalled();
  expect(requests.save).toHaveBeenCalledTimes(1);
});

it('restores an available focus target only after the busy DOM is committed ready', async () => {
  const page = await smtp();
  page.render().change('fromName', '已保存');
  const saving = page.render().save();
  page.render();
  await saving;
  page.render();
  page.flushFrames();
  expect(page.dom.activeElement).toBe(page.heading);
  expect(page.save.disabled).toBe(true);
  expect(requests.save).toHaveBeenCalledTimes(1);
});

it('returns focus after cancelling dirty-test confirmation and retains the draft', async () => {
  const page = await smtp();
  page.render().change('fromName', '未保存的编辑');
  page.render().test();
  expect(page.render().dialog).toBe('test-confirm');
  page.render().closeDialog();
  expect(page.render().dialog).toBeNull();
  expect(page.dom.activeElement).toBe(page.test);
  expect(page.render().draft.fromName).toBe('未保存的编辑');
  expect(requests.save).not.toHaveBeenCalled();
  expect(requests.test).not.toHaveBeenCalled();
});

it('returns focus to the enabled test action after its busy state commits idle', async () => {
  const page = await smtp();
  let resolve!: () => void;
  requests.test.mockReturnValue(
    new Promise<void>((done) => {
      resolve = done;
    }),
  );
  const sending = page.render().send();
  expect(page.render().busy).toBe(true);
  expect(page.test.disabled).toBe(true);
  resolve();
  await sending;
  expect(page.render().busy).toBe(false);
  expect(page.test.disabled).toBe(false);
  expect(page.dom.activeElement).toBe(page.test);
  expect(requests.test).toHaveBeenCalledTimes(1);
});
