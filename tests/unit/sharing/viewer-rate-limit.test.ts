import {
  Children,
  isValidElement,
  type ComponentProps,
  type DependencyList,
  type EffectCallback,
  type ReactElement,
  type ReactNode,
} from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Button } from '@heroui/react/button';
import Image from 'next/image';
import ShareViewer from '../../../src/components/sharing/viewer';
import { ImageShareScreen } from '../../../src/components/sharing/image-share-screen';
import { ShareViewerCarousel } from '../../../src/components/sharing/viewer-carousel';
import type { PublicShareItem } from '../../../src/server/sharing/public-types';
import { createAccessLimiter } from '../../../src/server/access-protection/limiter';

const runtime = vi.hoisted(() => ({ current: null as Harness | null }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => runtime.current!.state(initial),
  useRef: (initial: unknown) => runtime.current!.ref(initial),
  useEffect: (effect: EffectCallback, deps?: DependencyList) =>
    runtime.current!.effect(effect, deps),
  useCallback: (callback: unknown, deps: DependencyList) =>
    runtime.current!.callback(callback, deps),
}));
vi.mock('react-aria/usePreventScroll', () => ({
  usePreventScroll: () => undefined,
}));
vi.mock('../../../src/components/sharing/viewer-carousel', () => ({
  ShareViewerCarousel: () => null,
}));
function ViewerHarness(props: ComponentProps<typeof ShareViewer>) {
  return ShareViewer(props);
}
function ImageShareHarness(props: ComponentProps<typeof ImageShareScreen>) {
  return ImageShareScreen(props);
}
class Harness {
  cells: unknown[] = [];
  cursor = 0;
  pending: (() => void)[] = [];
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
      !deps ||
      !previous ||
      deps.some((value, i) => !Object.is(value, previous[i]))
    ) {
      this.cells[index] = deps;
      this.pending.push(() => {
        this.cleanups.get(index)?.();
        this.cleanups.delete(index);
        const cleanup = effect();
        if (cleanup) this.cleanups.set(index, cleanup);
      });
    }
  }
  callback(callback: unknown, deps: DependencyList) {
    const index = this.cursor++;
    const previous = this.cells[index] as
      { deps: DependencyList; callback: unknown } | undefined;
    if (
      !previous ||
      deps.some((value, i) => !Object.is(value, previous.deps[i]))
    )
      this.cells[index] = { deps, callback };
    return (this.cells[index] as { callback: unknown }).callback;
  }
  render(props: ComponentProps<typeof ShareViewer>) {
    this.cursor = 0;
    runtime.current = this;
    const tree = ViewerHarness(props);
    for (const effect of this.pending.splice(0)) effect();
    return tree;
  }
  renderShare(props: ComponentProps<typeof ImageShareScreen>) {
    this.cursor = 0;
    runtime.current = this;
    const tree = ImageShareHarness(props);
    for (const effect of this.pending.splice(0)) effect();
    return tree;
  }
  unmount() {
    for (const cleanup of this.cleanups.values()) cleanup();
    this.cleanups.clear();
  }
}
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [
    node as ReactElement<Record<string, unknown>>,
    ...Children.toArray(node.props.children).flatMap(nodes),
  ];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!isValidElement<{ children?: ReactNode }>(node)) return '';
  return Children.toArray(node.props.children).map(text).join('');
}
function carousel(tree: ReactNode) {
  return nodes(tree).find((node) => node.type === ShareViewerCarousel)!
    .props as ComponentProps<typeof ShareViewerCarousel>;
}
function retryButton(tree: ReactNode) {
  return nodes(tree).find(
    (node) =>
      node.type === Button &&
      text(node.props.children as ReactNode).includes('重新加载'),
  )!.props as ComponentProps<typeof Button>;
}
const item = (id: string): PublicShareItem => ({
  imageId: id,
  aspectRatio: 1,
  status: 'ready',
  previewUrl: `/i/${id}`,
  thumbnailUrl: `/i/${id}?type=thumbnail`,
});
const fetcher = vi.fn();
let harness: Harness;
let props: ComponentProps<typeof ShareViewer>;
beforeEach(() => {
  harness = new Harness();
  fetcher.mockReset();
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('window', {
    location: { origin: 'https://images.example.test' },
    setTimeout: (callback: () => void, delay: number) =>
      setTimeout(callback, delay),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
  });
  vi.stubGlobal(
    'document',
    Object.assign(new EventTarget(), { hidden: false }),
  );
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  props = {
    viewer: {
      current: item('one'),
      previous: null,
      next: item('two'),
      total: 2,
      position: 1,
      showName: false,
    },
    loading: false,
    error: '',
    refreshError: '',
    refreshing: false,
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    onRetry: vi.fn(),
    onCheck: vi.fn(),
  };
});
afterEach(() => {
  harness.unmount();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('adds no HEAD requests for normal images, neighboring preload failures or metadata errors', () => {
  const tree = harness.render(props);
  expect(fetcher).not.toHaveBeenCalled();
  carousel(tree).onFailure('/i/two');
  harness.render(props);
  expect(fetcher).not.toHaveBeenCalled();
  harness.render({ ...props, error: '相邻信息读取失败' });
  expect(fetcher).not.toHaveBeenCalled();
});

it('probes the current failed image once, waits for Retry-After and requires a manual retry', async () => {
  fetcher.mockResolvedValue(
    new Response(null, { status: 429, headers: { 'retry-after': '2' } }),
  );
  carousel(harness.render(props)).onFailure('/i/one');
  harness.render(props);
  await vi.advanceTimersByTimeAsync(0);
  let tree = harness.render(props);
  expect(text(tree)).toContain('访问较频繁，请稍后重试');
  expect(retryButton(tree).isDisabled).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2000);
  tree = harness.render(props);
  expect(retryButton(tree).isDisabled).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
  retryButton(tree).onPress!({} as never);
  harness.render(props);
  expect(props.onRetry).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(['change', 'close'])(
  'aborts and ignores a late probe when the viewer action is %s',
  async (action) => {
    let resolve!: (response: Response) => void;
    fetcher.mockReturnValue(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    carousel(harness.render(props)).onFailure('/i/one');
    harness.render(props);
    const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
    if (action === 'close') harness.unmount();
    else {
      props = { ...props, viewer: { ...props.viewer, current: item('two') } };
      harness.render(props);
    }
    expect(signal.aborted).toBe(true);
    resolve(new Response(null, { status: 429 }));
    await vi.advanceTimersByTimeAsync(0);
    if (action === 'change')
      expect(text(harness.render(props))).not.toContain('访问较频繁');
    expect(fetcher).toHaveBeenCalledOnce();
  },
);

it('keeps the ordinary manual retry available while a diagnostic HEAD is still pending', () => {
  fetcher.mockReturnValue(new Promise<Response>(() => undefined));
  carousel(harness.render(props)).onFailure('/i/one');
  const tree = harness.render(props);
  expect(retryButton(tree).isDisabled).toBe(false);
  const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
  retryButton(tree).onPress!({} as never);
  harness.render(props);
  expect(signal.aborted).toBe(true);
  expect(props.onRetry).toHaveBeenCalledOnce();
});

function singleTokenShare() {
  const limiter = createAccessLimiter({ rate: 1, burst: 1 });
  const requests: string[] = [];
  const request = (method: string) => {
    requests.push(method);
    return limiter.take('192.0.2.20', Date.now()).allowed
      ? new Response(method === 'GET' ? 'image-bytes' : null, { status: 200 })
      : new Response(null, { status: 429, headers: { 'retry-after': '1' } });
  };
  fetcher.mockImplementation((_url, init) =>
    Promise.resolve(request(init.method)),
  );
  const shareProps: ComponentProps<typeof ImageShareScreen> = {
    token: 'single-token-share',
    initial: {
      status: 200,
      view: {
        mediaUrl: '/s/image/single-token-share/media',
        expiresAt: '1970-01-01T01:00:00Z',
      },
    },
    brand: { name: 'Ariso', description: '' },
    timeZone: 'UTC',
  };
  const image = (tree: ReactNode) =>
    nodes(tree).find((node) => node.type === Image);
  const get = (tree: ReactNode) => {
    const element = image(tree);
    expect(element).toBeDefined();
    const response = request('GET');
    if (!response.ok) (element!.props.onError as () => void)();
    return response;
  };
  return { limiter, requests, shareProps, get, image };
}

it('recovers a confirmed 429 with one GET at rate=1 burst=1 instead of consuming its only allowance with HEAD', async () => {
  const share = singleTokenShare();
  share.limiter.take('192.0.2.20', Date.now());
  expect(share.get(harness.renderShare(share.shareProps)).status).toBe(429);
  await vi.advanceTimersByTimeAsync(0);
  let tree = harness.renderShare(share.shareProps);
  expect(text(tree)).toContain('访问较频繁，请稍后重试');
  expect(retryButton(tree).isDisabled).toBe(true);
  expect(share.requests).toEqual(['GET', 'HEAD']);
  await vi.advanceTimersByTimeAsync(1000);
  tree = harness.renderShare(share.shareProps);
  expect(retryButton(tree).isDisabled).toBe(false);
  share.requests.length = 0;
  retryButton(tree).onPress!({} as never);
  await vi.advanceTimersByTimeAsync(0);
  expect(share.get(harness.renderShare(share.shareProps)).status).toBe(200);
  expect(share.requests).toEqual(['GET']);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('does not spend the refilled single allowance on a visibility check while waiting for a manual rate-limit retry', async () => {
  const share = singleTokenShare();
  share.limiter.take('192.0.2.20', Date.now());
  share.get(harness.renderShare(share.shareProps));
  await vi.advanceTimersByTimeAsync(0);
  harness.renderShare(share.shareProps);
  await vi.advanceTimersByTimeAsync(1000);
  harness.renderShare(share.shareProps);
  share.requests.length = 0;
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(share.requests).toEqual([]);
});

it('retains HEAD checks for visibility changes when the share is not rate limited', async () => {
  const share = singleTokenShare();
  harness.renderShare(share.shareProps);
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(share.requests).toEqual(['HEAD']);
});
