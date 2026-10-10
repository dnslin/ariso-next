import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EffectCallback } from 'react';
import { useOwnerSession } from '../../../src/components/identity/session-controls';

// Retain the hook's public state while controlling HTTP response delivery.
const runtime = vi.hoisted(() => ({
  cells: [] as unknown[],
  cursor: 0,
  effects: [] as EffectCallback[],
  mounted: false,
}));
const upload = vi.hoisted(() => ({ reset: vi.fn() }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useCallback: (callback: unknown) => callback,
  useState(initial: unknown) {
    const index = runtime.cursor++;
    if (!(index in runtime.cells)) runtime.cells[index] = initial;
    return [
      runtime.cells[index],
      (value: unknown) => {
        runtime.cells[index] = value;
      },
    ];
  },
  useRef(initial: unknown) {
    const index = runtime.cursor++;
    if (!(index in runtime.cells)) runtime.cells[index] = { current: initial };
    return runtime.cells[index];
  },
  useEffect(effect: EffectCallback) {
    if (!runtime.mounted) runtime.effects.push(effect);
  },
}));
vi.mock('../../../src/components/upload/provider', () => ({
  useResetUpload: () => upload.reset,
  useUploadSessionExpiry: vi.fn(),
}));
vi.mock('@heroui/react/alert', () => ({ Alert: 'alert' }));
vi.mock('@heroui/react/button', () => ({ Button: 'button' }));
vi.mock('@heroui/react/spinner', () => ({ Spinner: 'spinner' }));
vi.mock('@heroui/react/popover', () => ({ Popover: 'popover' }));

function SessionHarness(onExpire?: () => void) {
  runtime.cursor = 0;
  const result = useOwnerSession('/settings/account', onExpire);
  runtime.mounted = true;
  return result;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const replace = vi.fn();
const cleanups: (() => void)[] = [];
beforeEach(() => {
  runtime.cells = [];
  runtime.cursor = 0;
  runtime.effects = [];
  runtime.mounted = false;
  upload.reset.mockReset();
  replace.mockReset();
  const events = new EventTarget();
  vi.stubGlobal('window', {
    location: { replace },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.unstubAllGlobals();
});

it('completes a server-confirmed logout without a second rate-limited session read', async () => {
  const fetcher = vi.fn(async (path: string) =>
    path === '/api/auth/sign-out'
      ? Response.json({ success: true })
      : Response.json({ message: 'Too many requests' }, { status: 429 }),
  );
  vi.stubGlobal('fetch', fetcher);
  const destination = '/login?reason=signed-out&returnTo=%2Fsettings%2Faccount';
  await SessionHarness().signOut(destination);
  expect(upload.reset).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledExactlyOnceWith(destination);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('retains the page after a failed logout and permits an explicit retry', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({}, { status: 500 }))
    .mockResolvedValueOnce(Response.json({ success: true }));
  vi.stubGlobal('fetch', fetcher);
  expect(await SessionHarness().signOut()).toContain('HTTP 500');
  expect(SessionHarness().busy).toBe(false);
  expect(SessionHarness().message).toContain('HTTP 500');
  expect(upload.reset).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  await SessionHarness().signOut();
  expect(upload.reset).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledExactlyOnceWith('/login?reason=signed-out');
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('does not let a background null session override a pending explicit logout', async () => {
  const background = deferred<Response>();
  const logout = deferred<Response>();
  const fetcher = vi.fn((path: string) =>
    path === '/api/auth/sign-out' ? logout.promise : background.promise,
  );
  vi.stubGlobal('fetch', fetcher);
  const expired = vi.fn();
  const session = SessionHarness(expired);
  for (const effect of runtime.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
  const signingOut = session.signOut();
  background.resolve(Response.json(null));
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(SessionHarness(expired).busy).toBe(true);
  expect(expired).not.toHaveBeenCalled();
  expect(upload.reset).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  logout.resolve(Response.json({ success: true }));
  await signingOut;
  expect(upload.reset).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledExactlyOnceWith('/login?reason=signed-out');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
