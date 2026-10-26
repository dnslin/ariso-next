import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DependencyList, EffectCallback } from 'react';
import { useEditorState } from '../../../src/components/image-editor/state';

const runtime = vi.hoisted(() => ({ current: null as Hooks | null }));
const actions = vi.hoisted(() => ({
  resetUpload: vi.fn(),
  router: { push: vi.fn() },
  context: vi.fn(),
  templates: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => runtime.current!.state(initial),
  useRef: (initial: unknown) => runtime.current!.ref(initial),
  useCallback: (callback: unknown, deps: DependencyList) =>
    runtime.current!.callback(callback, deps),
  useMemo: (factory: () => unknown, deps: DependencyList) =>
    runtime.current!.memo(factory, deps),
  useEffect: (effect: EffectCallback, deps?: DependencyList) =>
    runtime.current!.effect(effect, deps),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) =>
    snapshot(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => actions.router,
}));
vi.mock('@heroui/react/toast', () => ({ toast: vi.fn() }));
vi.mock('../../../src/components/upload/provider', () => ({
  useResetUpload: () => actions.resetUpload,
}));
vi.mock('../../../src/components/image-editor/client', async (original) => ({
  ...(await original<
    typeof import('../../../src/components/image-editor/client')
  >()),
  readEditContext: actions.context,
  readEditTemplates: actions.templates,
}));

function useTestEditor() {
  return useEditorState({
    imageIds: ['first', 'second'],
    onClose: close,
  });
}

// Follow the existing hook harness, including React's Object.is state bailout.
// This lets the actual editor hook determine whether another render is needed.
class Hooks {
  private cells: unknown[] = [];
  private cursor = 0;
  private effects: (() => void)[] = [];
  private cleanups = new Map<number, () => void>();
  private scheduled = false;
  renders = 0;
  current!: ReturnType<typeof useEditorState>;
  state(initial: unknown) {
    const index = this.cursor++;
    if (!(index in this.cells))
      this.cells[index] = typeof initial === 'function' ? initial() : initial;
    return [
      this.cells[index],
      (value: unknown) => {
        const previous = this.cells[index];
        const next = typeof value === 'function' ? value(previous) : value;
        if (Object.is(next, previous)) return;
        this.cells[index] = next;
        this.scheduled = true;
      },
    ];
  }
  ref(initial: unknown) {
    const index = this.cursor++;
    return (this.cells[index] ??= { current: initial });
  }
  callback<T>(value: T, deps: DependencyList): T {
    const index = this.cursor++;
    const previous = this.cells[index] as
      { value: T; deps: DependencyList } | undefined;
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i])))
      this.cells[index] = { value, deps };
    return (this.cells[index] as { value: T }).value;
  }
  memo(factory: () => unknown, deps: DependencyList) {
    const index = this.cursor++;
    const previous = this.cells[index] as
      { value: unknown; deps: DependencyList } | undefined;
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i])))
      this.cells[index] = { value: factory(), deps };
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
  render(component = useTestEditor) {
    this.cursor = 0;
    this.scheduled = false;
    runtime.current = this;
    this.renders++;
    this.current = component();
    for (const effect of this.effects.splice(0)) effect();
    return this.current;
  }
  flush() {
    if (this.scheduled) this.render();
    return this.current;
  }
  unmount() {
    for (const cleanup of this.cleanups.values()) cleanup();
  }
}

const close = () => undefined;
let hooks: Hooks;
beforeEach(async () => {
  hooks = new Hooks();
  actions.context.mockImplementation(async (id: string) => ({
    imageId: id,
    name: `${id}.png`,
    format: 'png',
    mime: 'image/png',
    width: 640,
    height: 480,
    sourceObjectId: `object-${id}`,
    sourceUrl: `/api/images/${id}/edit/source`,
    unavailableReason: null,
    watermarkPreview: { copy: false, overwrite: false },
  }));
  actions.templates.mockResolvedValue({ templates: [] });
  vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('sessionStorage', { getItem: () => null });
  hooks.render();
  await new Promise(setImmediate);
  hooks.flush();
  expect(hooks.current.loading).toBe(false);
  expect(hooks.current.images).toHaveLength(2);
});
afterEach(() => {
  hooks.unmount();
  vi.unstubAllGlobals();
});

it('repeated decoded dimensions preserve image state and do not schedule another render', () => {
  const images = hooks.current.images;
  const renders = hooks.renders;
  hooks.current.naturalSize('first', 640, 480);
  hooks.flush();
  expect(hooks.current.images).toBe(images);
  expect(hooks.renders).toBe(renders);
});

it('a dimension callback for an absent image preserves state and does not rerender', () => {
  const images = hooks.current.images;
  const renders = hooks.renders;
  hooks.current.naturalSize('removed', 800, 600);
  hooks.flush();
  expect(hooks.current.images).toBe(images);
  expect(hooks.renders).toBe(renders);
});

it.each([
  [800, 480],
  [640, 600],
  [800, 600],
])(
  'changed dimensions %s × %s update only that image once',
  (width, height) => {
    const images = hooks.current.images;
    const renders = hooks.renders;
    hooks.current.naturalSize('first', width, height);
    hooks.flush();
    expect(hooks.current.images).not.toBe(images);
    expect(hooks.current.images[0]).toEqual({ ...images[0], width, height });
    expect(hooks.current.images[1]).toBe(images[1]);
    expect(hooks.renders).toBe(renders + 1);

    const updated = hooks.current.images;
    hooks.current.naturalSize('first', width, height);
    hooks.flush();
    expect(hooks.current.images).toBe(updated);
    expect(hooks.renders).toBe(renders + 1);
  },
);
