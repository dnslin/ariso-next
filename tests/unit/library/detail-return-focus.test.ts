import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDetailNavigation } from '../../../src/app/library/use-detail-navigation';

const hooks = vi.hoisted(() => ({
  cells: [] as unknown[],
  cursor: 0,
  href: 'http://ariso.test/library',
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useRef: (value: unknown) => {
    const index = hooks.cursor++;
    return (hooks.cells[index] ??= { current: value });
  },
  useState: (value: unknown) => {
    const index = hooks.cursor++;
    hooks.cells[index] ??= value;
    return [
      hooks.cells[index],
      (value: unknown) => {
        hooks.cells[index] = value;
      },
    ];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void) => effect(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URL(hooks.href).searchParams,
}));

const main = { scrollTop: 360 };
let active: unknown;
let current: ReturnType<typeof button> | null;
let frames: Map<number, () => void>;
let frameId: number;
function button(name: string) {
  const node = {
    name,
    tagName: 'BUTTON',
    disabled: false,
    hidden: false,
    isConnected: true,
    getAttribute: (key: string) => (key === 'aria-label' ? name : null),
    matches: (selector: string): boolean =>
      selector.includes('disabled') && node.disabled,
    getClientRects: (): { width: number; height: number }[] =>
      node.hidden ? [] : [{ width: 44, height: 44 }],
    closest: (selector: string): unknown =>
      selector.includes('data-image-id') ? card : null,
    focus: vi.fn((): void => {
      if (node.disabled || !node.isConnected) return;
      active = node;
    }),
  };
  return node;
}
const card = {
  dataset: { imageId: 'image' },
  getAttribute: (name: string) => (name === 'data-image-id' ? 'image' : null),
  querySelector: () => current,
};
const body = { tagName: 'BODY' };
let source: ReturnType<typeof button>;
let fallback: ReturnType<typeof button>;
let other: ReturnType<typeof button>;

function render(ready = true) {
  hooks.cursor = 0;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Preserve the real navigation hook's cells across URL/readiness updates.
  const navigation = useDetailNavigation('#fallback');
  navigation.resumeCloseFocus(ready);
  return navigation;
}
function flush() {
  for (const id of [...frames.keys()]) {
    const callback = frames.get(id);
    frames.delete(id);
    callback?.();
  }
}
function closeWhileLoading() {
  render().open('image', source as unknown as HTMLElement);
  render();
  source.disabled = true;
  render().close();
  render(false).dialogRef(null);
  flush();
}

beforeEach(() => {
  hooks.cells = [];
  hooks.href = 'http://ariso.test/library';
  frames = new Map();
  frameId = 0;
  active = body;
  main.scrollTop = 360;
  source = button('查看图片：源图片');
  current = source;
  fallback = button('图库搜索');
  other = button('用户自行聚焦的操作');
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    const id = ++frameId;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.stubGlobal('document', {
    body,
    get activeElement() {
      return active;
    },
    getElementById: () => main,
    querySelector: (selector: string) =>
      selector === '#fallback'
        ? fallback
        : selector === '[data-image-id="image"] [data-library-open]'
          ? current
          : null,
  });
  const history: string[] = [];
  vi.stubGlobal('window', {
    location: {
      get href() {
        return hooks.href;
      },
    },
    history: {
      pushState: (_state: unknown, _title: string, href: URL) => {
        history.push(hooks.href);
        hooks.href = String(href);
      },
      replaceState: (_state: unknown, _title: string, href: URL) => {
        hooks.href = String(href);
      },
      back: () => {
        hooks.href = history.pop()!;
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

it('waits for the disabled source to become ready instead of downgrading focus to the fallback', () => {
  closeWhileLoading();
  expect(active).toBe(body);
  expect(fallback.focus).not.toHaveBeenCalled();
  source.disabled = false;
  render(true);
  flush();
  expect(active).toBe(source);
  expect(source.focus).toHaveBeenLastCalledWith({ preventScroll: true });
  expect(fallback.focus).not.toHaveBeenCalled();
  expect(main.scrollTop).toBe(360);
});

it('restores the current opener for the same image when its old DOM reference was rebuilt', () => {
  closeWhileLoading();
  source.isConnected = false;
  current = button('查看图片：同ID新节点');
  render(true);
  flush();
  expect(active).toBe(current);
  expect(fallback.focus).not.toHaveBeenCalled();
});

it('uses the fallback only after the ready list confirms the source image is gone', () => {
  closeWhileLoading();
  source.isConnected = false;
  current = null;
  render(false);
  flush();
  expect(fallback.focus).not.toHaveBeenCalled();
  render(true);
  flush();
  expect(active).toBe(fallback);
});

it('does not steal a new user focus while the source waits to become ready', () => {
  closeWhileLoading();
  other.focus();
  source.disabled = false;
  render(true);
  flush();
  expect(active).toBe(other);
  expect(fallback.focus).not.toHaveBeenCalled();
});

it('consumes a successful return intent so later refetches do not refocus the old source', () => {
  closeWhileLoading();
  source.disabled = false;
  render(true);
  flush();
  expect(active).toBe(source);
  const restored = source.focus.mock.calls.length;
  other.focus();
  render(false);
  render(true);
  flush();
  expect(active).toBe(other);
  expect(source.focus).toHaveBeenCalledTimes(restored);
});

it('does not register a source-card return when detail only switches to its versions workspace', () => {
  render().open('image', source as unknown as HTMLElement);
  render().openView('versions');
  render(false).dialogRef(null);
  flush();
  expect(new URL(hooks.href).searchParams.get('image')).toBe('image');
  expect(source.focus).not.toHaveBeenCalled();
  expect(fallback.focus).not.toHaveBeenCalled();
});
