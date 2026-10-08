import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EffectCallback } from 'react';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { UploadController } from '../../../src/components/upload/controller';
import type { UploadSettings } from '../../../src/components/upload/settings';
import type { SavedUploadLimits } from '../../../src/components/upload-limits/api';

// Only React lifecycle delivery and DOM focus are modeled. Requests, query
// invalidation and queue admission use the actual feature and library code.
const runtime = vi.hoisted(() => ({
  effects: [] as (() => void)[],
  client: null as QueryClient | null,
  upload: null as { client: QueryClient; controller: UploadController } | null,
  reset: vi.fn(),
  notice: vi.fn(),
  closeNotice: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => [
    typeof initial === 'function' ? initial() : initial,
    vi.fn(),
  ],
  useRef: (current: unknown) => ({ current }),
  useCallback: (fn: unknown) => fn,
  useEffect: (effect: EffectCallback) => {
    const cleanup = effect();
    if (cleanup) runtime.effects.push(cleanup);
  },
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => runtime.client,
}));
vi.mock('@heroui/react/toast', () => ({
  toast: Object.assign(runtime.notice, { close: runtime.closeNotice }),
}));
vi.mock('../../../src/components/upload/provider', () => ({
  useUploadQueue: () => runtime.upload,
  useResetUpload: () => runtime.reset,
}));
import { useUploadLimits } from '../../../src/components/upload-limits/use-upload-limits';

const mib = 1048576;
const limits = (maxFileMiB: number): SavedUploadLimits => ({
  maxFileMiB,
  maxFileBytes: maxFileMiB * mib,
  batchSize: 20,
  queueLimit: 500,
});
const uploadSettings = (saved: SavedUploadLimits): UploadSettings => ({
  maxFileBytes: saved.maxFileBytes,
  batchSize: saved.batchSize,
  queueLimit: saved.queueLimit,
  defaultVisibility: 'public',
  defaultStorageId: 'local',
  storages: [{ id: 'local', name: 'Local', enabled: true }],
  albums: [],
  tags: [],
});
let unsubscribe: () => void;
let frames: FrameRequestCallback[];
let focus: ReturnType<typeof vi.fn>;
let server: SavedUploadLimits;
let held: ReturnType<typeof Promise.withResolvers<Response>>;
let patchCount: number;
let holdReadBack: boolean;
let reads: string[];

function unmount() {
  runtime.effects.splice(0).forEach((cleanup) => cleanup());
}

beforeEach(() => {
  runtime.client = new QueryClient();
  const client = new QueryClient();
  const controller = new UploadController({
    maxFileBytes: 10 * mib,
    queueLimit: 500,
  });
  runtime.upload = { client, controller };
  server = limits(10);
  client.setQueryData(['upload-settings'], uploadSettings(server));
  runtime.client.setQueryData(['upload-limits'], server);
  frames = [];
  focus = vi.fn();
  vi.stubGlobal('document', {
    activeElement: { isConnected: true, matches: () => false, focus },
    querySelector: () => ({ focus }),
  });
  vi.stubGlobal('CSS', { escape: (field: string) => field });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    frames.push(callback),
  );
  held = Promise.withResolvers<Response>();
  patchCount = 0;
  holdReadBack = false;
  reads = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (init?.method === 'PATCH') {
        const value = JSON.parse(String(init.body)) as SavedUploadLimits;
        server = limits(value.maxFileMiB);
        patchCount += 1;
        if (patchCount === 1) {
          if (holdReadBack) return new Response('unavailable', { status: 503 });
          return held.promise;
        }
        return Response.json(server);
      }
      reads.push(path);
      if (path === '/api/settings/upload' && holdReadBack) return held.promise;
      return Response.json(
        path === '/upload/settings' ? uploadSettings(server) : server,
      );
    }),
  );
  const observer = new QueryObserver(client, {
    queryKey: ['upload-settings'],
    queryFn: async () => {
      const response = await fetch('/upload/settings');
      return (await response.json()) as UploadSettings;
    },
    staleTime: Infinity,
    retry: false,
  });
  unsubscribe = observer.subscribe(({ data }) => {
    if (data) controller.updateLimits(data);
  });
  runtime.reset.mockImplementation(() => {
    controller.destroy();
    client.clear();
  });
});
afterEach(() => {
  unmount();
  unsubscribe();
  runtime.upload!.controller.destroy();
  runtime.upload!.client.clear();
  runtime.client!.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each(['save', 'read-back'] as const)(
  'does not replace newer limits when an unmounted %s returns late',
  async (kind) => {
    holdReadBack = kind === 'read-back';
    const controller = runtime.upload!.controller;
    expect(
      controller.add(
        new File(['image'], 'existing.png', { type: 'image/png' }),
      ),
    ).toBeNull();
    const existingIds = controller.snapshot.map(({ id }) => id);
    const older = useUploadLimits(limits(50));
    const oldRequest = older.save();
    if (holdReadBack)
      await vi.waitFor(() => expect(reads).toContain('/api/settings/upload'));
    unmount();
    await useUploadLimits(limits(60)).save();
    frames.splice(0).forEach((callback) => callback(0));
    focus.mockClear();
    runtime.notice.mockClear();
    held.resolve(Response.json(limits(50)));
    await oldRequest;
    await vi.waitFor(() => expect(reads).toContain('/upload/settings'));
    expect(
      runtime.upload!.client.getQueryData<UploadSettings>(['upload-settings'])
        ?.maxFileBytes,
    ).toBe(60 * mib);
    expect(runtime.client!.getQueryData(['upload-limits'])).toEqual(limits(60));
    expect(controller.snapshot.map(({ id }) => id)).toEqual(existingIds);
    expect(
      controller.add(
        new File([new Uint8Array(55 * mib)], 'allowed.png', {
          type: 'image/png',
        }),
      ),
    ).toBeNull();
    frames.splice(0).forEach((callback) => callback(0));
    expect(focus).not.toHaveBeenCalled();
    expect(runtime.notice).not.toHaveBeenCalled();
    expect(patchCount).toBe(2);
    expect(reads.filter((path) => path === '/upload/settings')).toHaveLength(1);
  },
);

it('refreshes a committed save after leaving instead of keeping the old provider limit', async () => {
  const oldRequest = useUploadLimits(limits(50)).save();
  unmount();
  held.resolve(Response.json(limits(50)));
  await oldRequest;
  await vi.waitFor(() =>
    expect(
      runtime.upload!.client.getQueryData<UploadSettings>(['upload-settings'])
        ?.maxFileBytes,
    ).toBe(50 * mib),
  );
  expect(reads).toEqual(['/upload/settings']);
  expect(runtime.client!.getQueryData(['upload-limits'])).toEqual(limits(10));
  expect(runtime.client!.getQueryState(['upload-limits'])?.isInvalidated).toBe(
    true,
  );
  expect(patchCount).toBe(1);
});

it.each([401, 503])(
  'ignores detached HTTP %s without expiring the current queue or retrying PATCH',
  async (status) => {
    const oldRequest = useUploadLimits(limits(50)).save();
    unmount();
    await useUploadLimits(limits(60)).save();
    held.resolve(new Response('old failure', { status }));
    await oldRequest;
    await vi.waitFor(() => expect(reads).toContain('/upload/settings'));
    expect(runtime.reset).not.toHaveBeenCalled();
    expect(
      runtime.upload!.client.getQueryData<UploadSettings>(['upload-settings'])
        ?.maxFileBytes,
    ).toBe(60 * mib);
    expect(reads).toEqual(['/upload/settings']);
    expect(patchCount).toBe(2);
  },
);

it('does not restore focus when a confirmed save frame runs after navigation', async () => {
  patchCount = 1;
  await useUploadLimits(limits(60)).save();
  unmount();
  frames.splice(0).forEach((callback) => callback(0));
  expect(focus).not.toHaveBeenCalled();
});

it('does not restore a cleared session queue after an earlier PATCH succeeds', async () => {
  const editor = useUploadLimits(limits(50));
  const saving = editor.save();
  editor.expire();
  held.resolve(Response.json(limits(50)));
  await saving;
  expect(
    runtime.upload!.client.getQueryData(['upload-settings']),
  ).toBeUndefined();
  expect(runtime.client!.getQueryData(['upload-limits'])).toEqual(limits(10));
  expect(runtime.notice).not.toHaveBeenCalled();
  frames.splice(0).forEach((callback) => callback(0));
  expect(focus).not.toHaveBeenCalled();
  expect(reads).toEqual([]);
});
