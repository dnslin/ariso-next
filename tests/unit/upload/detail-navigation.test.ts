import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDetailNavigation } from '../../../src/app/library/use-detail-navigation';

const hooks = vi.hoisted(() => ({
  cells: [] as unknown[],
  cursor: 0,
  href: 'http://ariso.test/upload',
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
      (next: unknown) => {
        hooks.cells[index] = next;
      },
    ];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void) => effect(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URL(hooks.href).searchParams,
}));
const main = { scrollTop: 0 };
const trigger = { focus: vi.fn(), isConnected: true };
const fallback = { focus: vi.fn() };
const versionEntry = { focus: vi.fn() };
let history: string[];
function render() {
  hooks.cursor = 0;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- This harness retains mocked hook cells across history updates.
  return useDetailNavigation('#upload-title');
}
beforeEach(() => {
  hooks.cells = [];
  main.scrollTop = 360;
  vi.clearAllMocks();
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback());
  vi.stubGlobal('document', {
    getElementById: () => main,
    querySelector: (selector: string) =>
      selector === '#upload-title' ? fallback : versionEntry,
  });
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
  history = [];
});
afterEach(() => vi.unstubAllGlobals());

it.each(['/upload', '/upload?albumId=a&returnTo=%2Falbums%2Fa%3Fpage%3D2'])(
  'keeps %s through details and versions, restoring the queue scroll and trigger',
  (source) => {
    hooks.href = `http://ariso.test${source}`;
    render().open('image', trigger as unknown as HTMLElement);
    render().openView('versions', 'original');
    expect(new URL(hooks.href).pathname).toBe('/upload');
    expect(new URL(hooks.href).searchParams.get('detailView')).toBe('versions');
    expect(main.scrollTop).toBe(0);
    render().returnToDetail();
    expect(new URL(hooks.href).searchParams.get('image')).toBe('image');
    expect(main.scrollTop).toBe(360);
    render().close();
    expect(hooks.href).toBe(`http://ariso.test${source}`);
    render().dialogRef(null);
    expect(trigger.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(main.scrollTop).toBe(360);
  },
);

it('browser back from versions returns to the upload entry without visiting the library', () => {
  hooks.href = 'http://ariso.test/upload?albumId=a';
  render().open('image', trigger as unknown as HTMLElement);
  render().openView('versions');
  render();
  window.history.back();
  render();
  expect(hooks.href).toBe('http://ariso.test/upload?albumId=a');
  expect(main.scrollTop).toBe(360);
  expect(trigger.focus).toHaveBeenCalledWith({ preventScroll: true });
});

it('a direct versions URL closes to its upload entry and focuses its heading', () => {
  hooks.href =
    'http://ariso.test/upload?albumId=a&image=image&detailView=versions&preview=original';
  render().close();
  render().dialogRef(null);
  expect(hooks.href).toBe('http://ariso.test/upload?albumId=a');
  expect(fallback.focus).toHaveBeenCalledWith({ preventScroll: true });
});
