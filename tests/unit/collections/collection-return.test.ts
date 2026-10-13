import type { DependencyList, EffectCallback } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCollectionReturn } from '../../../src/app/albums/use-collection-navigation';

const runtime = vi.hoisted(() => ({
  active: null as Lifetime | null,
  client: null as QueryClient | null,
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useRef: (initial: unknown) => {
      const scope = runtime.active!;
      return (scope.cells[scope.cursor++] ??= { current: initial });
    },
    useEffect: (effect: EffectCallback, deps: DependencyList) => {
      const scope = runtime.active!;
      const index = scope.cursor++;
      const previous = scope.cells[index] as DependencyList | undefined;
      if (
        !previous ||
        deps.some((value, i) => !Object.is(value, previous[i]))
      ) {
        scope.cells[index] = deps;
        scope.cleanup.get(index)?.();
        const cleanup = effect();
        if (cleanup) scope.cleanup.set(index, cleanup);
      }
    },
  };
});
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => runtime.client,
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

class Lifetime {
  cells: unknown[] = [];
  cursor = 0;
  cleanup = new Map<number, () => void>();
  render(href: string, ready: boolean) {
    this.cursor = 0;
    runtime.active = this;
    return ReturnProbe(href, ready);
  }
  unmount() {
    this.cleanup.forEach((cleanup) => cleanup());
  }
}
function ReturnProbe(href: string, ready: boolean) {
  return useCollectionReturn(href, ready);
}
const main = new EventTarget() as EventTarget & {
  scrollTop: number;
  scrollTo: ReturnType<typeof vi.fn>;
  querySelectorAll: ReturnType<typeof vi.fn>;
  querySelector: ReturnType<typeof vi.fn>;
};
const focus = vi.fn();
const source = {
  dataset: { collectionReturnFocus: 'share-album' },
  getClientRects: () => [1],
  focus,
} as unknown as HTMLElement;
const hidden = {
  dataset: { collectionReturnFocus: 'share-album' },
  getClientRects: () => [],
  focus: vi.fn(),
} as unknown as HTMLElement;
let frames: (() => void)[] = [];
const lifetimes: Lifetime[] = [];
function mount(href: string, ready = true) {
  const scope = new Lifetime();
  lifetimes.push(scope);
  return { scope, remember: scope.render(href, ready) };
}
beforeEach(() => {
  runtime.client = new QueryClient();
  main.scrollTop = 0;
  main.scrollTo = vi.fn((x: number, y: number) => {
    main.scrollTop = y;
  });
  main.querySelectorAll = vi.fn(() => [hidden, source]);
  main.querySelector = vi.fn(() => null);
  focus.mockReset();
  frames = [];
  vi.stubGlobal('document', {
    getElementById: () => main,
    activeElement: source,
  });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => {
  lifetimes.splice(0).forEach((scope) => scope.unmount());
  runtime.client?.clear();
  vi.unstubAllGlobals();
});

it('restores scroll and the visible source after the list remounts with real content ready', () => {
  const href = '/shares?q=旅行&page=2&pageSize=20';
  const first = mount(href);
  frames.splice(0).forEach((frame) => frame());
  main.scrollTop = 550;
  first.remember(source);
  first.scope.unmount();
  main.scrollTop = 0;
  const returned = mount(href, false);
  expect(frames).toHaveLength(0);
  returned.scope.render(href, true);
  frames.splice(0).forEach((frame) => frame());
  expect(main.scrollTop).toBe(550);
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  expect(hidden.focus).not.toHaveBeenCalled();
});

it('also retains the source on unmount for browser Back without an explicit return click', () => {
  const href = '/albums?q=旅行&page=3&pageSize=40';
  const first = mount(href);
  frames.splice(0).forEach((frame) => frame());
  main.scrollTop = 700;
  main.dispatchEvent(new Event('scroll'));
  first.scope.unmount();
  main.scrollTop = 0;
  mount(href);
  frames.splice(0).forEach((frame) => frame());
  expect(main.scrollTop).toBe(700);
});

it('does not apply a different search page scroll to a newly selected query', () => {
  const first = mount('/albums?q=旅行&page=2&pageSize=20');
  frames.splice(0).forEach((frame) => frame());
  main.scrollTop = 500;
  first.remember(source);
  first.scope.unmount();
  mount('/albums?q=旅行&page=1&pageSize=20');
  frames.splice(0).forEach((frame) => frame());
  expect(main.scrollTop).toBe(0);
});

it('does not restore or take focus when an album image dialog opens, changes subview, or closes', () => {
  const href =
    '/albums/album?returnTo=%2Falbums%3Fpage%3D2&q=forest&page=3&pageSize=20';
  const album = mount(href);
  frames.splice(0).forEach((frame) => frame());
  album.remember(source);
  album.scope.render(`${href}&image=photo`, true);
  album.scope.render(
    `${href}&image=photo&detailView=versions&preview=compressed`,
    true,
  );
  album.scope.render(`${href}&image=photo&detailView=reprocess`, true);
  album.scope.render(href, true);
  expect(frames).toHaveLength(0);
  expect(focus).not.toHaveBeenCalled();
});
