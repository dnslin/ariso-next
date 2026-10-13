import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  type QueryClient,
  type QueryObserver,
  type QueryObserverOptions,
} from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { TextField } from '@heroui/react/textfield';
import { TagsScreen } from '../../../src/app/tags/screen';
import { SharesScreen } from '../../../src/app/shares/list-screen';

const runtime = vi.hoisted(() => ({
  harness: null as Harness | null,
  search: '',
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) =>
      runtime.harness
        ? runtime.harness.state(initial)
        : actual.useState(initial),
    useRef: (initial: unknown) =>
      runtime.harness ? runtime.harness.ref(initial) : actual.useRef(initial),
    useCallback: (...args: Parameters<typeof actual.useCallback>) =>
      runtime.harness ? args[0] : actual.useCallback(...args),
    useEffect: (...args: Parameters<typeof actual.useEffect>) => {
      if (!runtime.harness) actual.useEffect(...args);
    },
  };
});
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(runtime.search),
}));
vi.mock('@tanstack/react-query', async (original) => {
  const actual = await original<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: (options: QueryObserverOptions<unknown>, client: QueryClient) => {
      const harness = runtime.harness!;
      if (!harness.observer) {
        harness.client = client;
        harness.observer = new actual.QueryObserver(client, options);
        harness.unsubscribe = harness.observer.subscribe(() => {});
      } else harness.observer.setOptions(options);
      return harness.observer.getCurrentResult();
    },
  };
});
vi.mock('../../../src/components/shell/owner-shell', () => ({
  OwnerShell: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../../../src/components/upload/provider', () => ({
  useResetUpload: () => vi.fn(),
}));
const shell = {
  name: 'Ariso',
  description: '',
  ownerName: 'Owner',
  email: 'owner@example.test',
  initialSidebarCollapsed: false,
  timeZone: 'UTC',
};
class Harness {
  cells: unknown[] = [];
  cursor = 0;
  observer: QueryObserver<unknown> | null = null;
  client: QueryClient | null = null;
  unsubscribe: (() => void) | null = null;
  constructor(readonly Screen: typeof TagsScreen | typeof SharesScreen) {}
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
    return (this.cells[index] ??= { current: initial });
  }
  render() {
    this.cursor = 0;
    runtime.harness = this;
    try {
      return this.Screen(shell);
    } finally {
      runtime.harness = null;
    }
  }
  search(value: string) {
    const input = elements(this.render()).find(
      (element) => element.type === TextField,
    )!;
    (input.props.onChange as (value: string) => void)(value);
  }
  dispose() {
    this.unsubscribe?.();
    this.observer?.destroy();
    this.client?.clear();
  }
}
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<Record<string, unknown>>(child)
      ? [child, ...elements(child.props.children as ReactNode)]
      : [],
  );
}
function page(kind: string, id: string) {
  return {
    items: [
      kind === 'tags'
        ? {
            id,
            displayName: id,
            imageCount: 1,
            createdAt: '2026-10-12T00:00:00Z',
            updatedAt: '2026-10-12T00:00:00Z',
          }
        : {
            id,
            albumId: id,
            albumName: id,
            publicImageCount: 1,
            hasPassword: false,
            expiresAt: null,
            state: 'enabled',
            cover: {
              imageId: null,
              displayName: null,
              thumbnailUrl: null,
              status: 'empty',
            },
          },
    ],
    total: 1,
    page: 1,
    pageSize: 40,
  };
}
const harnesses: Harness[] = [];
afterEach(() => {
  harnesses.splice(0).forEach((harness) => harness.dispose());
  runtime.search = '';
  vi.unstubAllGlobals();
});

it.each([
  { kind: 'tags', Screen: TagsScreen },
  { kind: 'shares', Screen: SharesScreen },
])(
  '$kind keeps actual old content while a new search is pending, disables old row actions, and replaces it only on the real response',
  async ({ kind, Screen }) => {
    const harness = new Harness(Screen);
    harnesses.push(harness);
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      history: {
        pushState: (_state: unknown, _unused: string, url: string) => {
          runtime.search = url.split('?')[1] ?? '';
        },
      },
    });
    let finish!: (response: Response) => void;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(page(kind, 'old-record')))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      );
    vi.stubGlobal('fetch', fetcher);
    await vi.waitFor(() =>
      expect(renderToStaticMarkup(harness.render())).toContain('old-record'),
    );
    harness.search('new');
    const pendingTree = harness.render();
    const pending = renderToStaticMarkup(pendingTree);
    expect(harness.observer!.getCurrentResult()).toMatchObject({
      isPlaceholderData: true,
      isFetching: true,
      isPending: false,
    });
    expect(pending).toContain('old-record');
    expect(pending).not.toContain('正在读取');
    const actions = pending.match(
      /<(?:a|span|button)\b[^>]*aria-label="(?:分享设置 |重命名标签 )[^>]*>/g,
    )!;
    expect(actions).toHaveLength(2);
    for (const action of actions) expect(action).toMatch(/disabled/);
    expect(fetcher.mock.calls[1][0]).toContain('q=new');
    finish(Response.json(page(kind, 'new-record')));
    await vi.waitFor(() => {
      const ready = renderToStaticMarkup(harness.render());
      expect(ready).toContain('new-record');
      expect(ready).not.toContain('old-record');
    });
  },
);

it.each([
  { kind: 'tags', Screen: TagsScreen },
  { kind: 'shares', Screen: SharesScreen },
])(
  '$kind exposes a failed replacement read rather than claiming the old rows match the new search',
  async ({ kind, Screen }) => {
    const harness = new Harness(Screen);
    harnesses.push(harness);
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      history: {
        pushState: (_state: unknown, _unused: string, url: string) => {
          runtime.search = url.split('?')[1] ?? '';
        },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(page(kind, 'old-record')))
        .mockResolvedValueOnce(
          Response.json({ message: '真实查询失败' }, { status: 500 }),
        ),
    );
    await vi.waitFor(() =>
      expect(renderToStaticMarkup(harness.render())).toContain('old-record'),
    );
    harness.search('failed');
    harness.render();
    await vi.waitFor(() =>
      expect(harness.observer!.getCurrentResult().isError).toBe(true),
    );
    const failed = renderToStaticMarkup(harness.render());
    expect(failed).toContain('真实查询失败');
    expect(failed).not.toContain('old-record');
    expect(failed).not.toContain('data-testid="tags-empty"');
    expect(failed).not.toContain('data-testid="shares-empty"');
  },
);
