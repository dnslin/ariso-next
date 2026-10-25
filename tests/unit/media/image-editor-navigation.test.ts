import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DependencyList, EffectCallback } from 'react';
import { useImageEditorNavigation } from '../../../src/components/image-editor/navigation';

const state = vi.hoisted(() => ({
  cells: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void)[],
  cleanups: new Map<number, () => void>(),
  params: new URLSearchParams(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState(initial: unknown) {
    const index = state.cursor++;
    if (!(index in state.cells))
      state.cells[index] = typeof initial === 'function' ? initial() : initial;
    return [
      state.cells[index],
      (value: unknown) => {
        state.cells[index] =
          typeof value === 'function' ? value(state.cells[index]) : value;
      },
    ];
  },
  useRef(initial: unknown) {
    const index = state.cursor++;
    return (state.cells[index] ??= { current: initial });
  },
  useCallback(callback: unknown) {
    return callback;
  },
  useEffect(effect: EffectCallback, deps: DependencyList) {
    const index = state.cursor++;
    const previous = state.cells[index] as DependencyList | undefined;
    if (previous && deps.every((value, i) => Object.is(value, previous[i])))
      return;
    state.cells[index] = deps;
    state.effects.push(() => {
      state.cleanups.get(index)?.();
      const cleanup = effect();
      if (cleanup) state.cleanups.set(index, cleanup);
    });
  },
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => state.params }));
const main = { scrollTop: 88 };
const target = { isConnected: true, focus: vi.fn() };
function render() {
  state.cursor = 0;
  const result = useImageEditorNavigation();
  state.effects.splice(0).forEach((effect) => effect());
  return result;
}
function url(value: string) {
  Object.assign(window, { location: { href: value } });
  state.params = new URL(value).searchParams;
}
beforeEach(() => {
  state.cells = [];
  state.effects = [];
  state.cleanups.clear();
  state.params = new URLSearchParams();
  target.focus.mockReset();
  main.scrollTop = 88;
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      location: { href: 'http://localhost/library?q=source' },
      history: {
        pushState: (_state: unknown, _unused: string, value: URL) => {
          Object.assign(window, { location: { href: value.href } });
        },
        back: vi.fn(),
        replaceState: vi.fn(),
      },
    }),
  );
  vi.stubGlobal('document', {
    getElementById: () => main,
    querySelector: () => target,
  });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback());
  vi.stubGlobal('sessionStorage', { setItem: vi.fn() });
});
afterEach(() => {
  state.cleanups.forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

it('同路径移除编辑参数后关闭工作区并恢复来源滚动及焦点，无需popstate', () => {
  const nav = render();
  nav.open(['source'], target as unknown as HTMLElement);
  // Next may deliver local state before the search-parameter update.
  expect(render().workspace).not.toBeNull();
  url(window.location.href);
  render();
  main.scrollTop = 0;
  url('http://localhost/library');
  render();
  expect(render().workspace).toBeNull();
  expect(main.scrollTop).toBe(88);
  expect(target.focus).toHaveBeenCalled();
});

it('普通图库初次挂载不改滚动或抢焦点；取消导航保留token和工作区', () => {
  render();
  expect(main.scrollTop).toBe(88);
  expect(target.focus).not.toHaveBeenCalled();
  render().open(['source'], target as unknown as HTMLElement);
  url(window.location.href);
  const opened = render();
  const token = opened.workspace!.token;
  expect(render().workspace?.token).toBe(token);
});

it('已接受的历史遍历改为另一token时不继续显示旧工作区', () => {
  render().open(['source'], target as unknown as HTMLElement);
  url(window.location.href);
  render();
  url('http://localhost/library?imageEdit=previous');
  render();
  expect(render().workspace).toBeNull();
  expect(render().recoverable).toBe(true);
});
