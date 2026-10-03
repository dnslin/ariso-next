import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { useLibrarySelection } from '../../../src/app/library/use-library-selection';
import {
  useLibraryBatch,
  batchSuccessFeedback,
  type BatchSnapshotItem,
  type LibraryBatch,
} from '../../../src/components/library/use-library-batch';
import type { BatchItemResult } from '../../../src/server/library/batch-types';

const calls = vi.hoisted(() => ({
  toast: vi.fn(),
  notify: vi.fn(),
  remove: vi.fn(),
  failure: vi.fn(),
}));
vi.mock('@heroui/react/toast', () => ({ toast: { success: calls.toast } }));
vi.mock('../../../src/components/library/library-changes', () => ({
  notifyLibraryChanged: calls.notify,
}));

function mount(
  action: 'public' | 'private',
  onRefresh = vi.fn().mockResolvedValue(undefined),
  count = 2,
  submitDuringRender = false,
) {
  let batch!: LibraryBatch;
  const focus = vi.fn();
  const source = { isConnected: true, focus } as unknown as HTMLElement;
  const items = Array.from({ length: count }, (_, index) => ({
    id: `image-${index}`,
    displayName: `图片${index}.png`,
    thumbnailUrl: `/i/image-${index}?type=thumbnail`,
    storage: { id: 'local', name: '本地', enabled: true },
  }));
  function Probe() {
    const [step, setStep] = useState(0);
    const selection = useLibrarySelection('query', items, 2);
    batch = useLibraryBatch({
      selection: {
        ...selection,
        remove: (id) => {
          calls.remove(id);
          selection.remove(id);
        },
        recordFailure: (id, message) => {
          calls.failure(id, message);
          selection.recordFailure(id, message);
        },
      },
      query: 'pageSize=80',
      onExpire: vi.fn(),
      onRefresh,
    });
    if (step === 0) selection.selectCurrent();
    if (step === 1) batch.open(action, source);
    if (submitDuringRender && step === 2) batch.submit();
    if (step < (submitDuringRender ? 3 : 2)) setStep(step + 1);
    return null;
  }
  // Use the same real-hook render-phase technique as selection.test.ts. Async
  // assertions observe the request, selection callbacks, refresh and Toast.
  renderToStaticMarkup(createElement(Probe));
  return { batch, focus, onRefresh };
}
const results = (statuses: BatchItemResult['status'][]): BatchItemResult[] =>
  statuses.map((status, index) => ({
    id: `image-${index}`,
    status,
    message: status === 'failed' ? '写入失败' : '状态已确认',
    inQuery: true,
  }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each(['public', 'private'] as const)(
  'returns to the current list and toasts actual changed/unchanged counts after %s finishes',
  async (action) => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json({ results: results(['changed', 'unchanged']) }),
      );
    vi.stubGlobal('fetch', request);
    const { batch, focus, onRefresh } = mount(action);
    expect(batch.workspace?.phase).toBe('confirm');
    expect(batch.workspace?.command).toEqual({
      type: 'visibility',
      visibility: action,
    });
    batch.submit();
    await vi.waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(calls.toast).toHaveBeenCalledOnce());
    expect(calls.toast).toHaveBeenCalledWith(
      `批量设为${action === 'public' ? '公开' : '私有'}完成`,
      { description: '1张已修改 · 1张无需修改' },
    );
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(calls.remove.mock.calls).toEqual([['image-0'], ['image-1']]);
    expect(calls.failure).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledOnce();
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
      ids: ['image-0', 'image-1'],
      mode: 'apply',
    });
  },
);

it('reports zero changes when all selected images already have the requested visibility', async () => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ results: results(['unchanged', 'unchanged']) }),
      ),
  );
  const { batch } = mount('public');
  batch.submit();
  await vi.waitFor(() => expect(calls.toast).toHaveBeenCalledOnce());
  expect(calls.toast).toHaveBeenCalledWith('批量设为公开完成', {
    description: '0张已修改 · 2张无需修改',
  });
});

it('does not hide a known failure behind a success Toast', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ results: results(['changed', 'failed']) }),
      ),
  );
  const { batch, onRefresh, focus } = mount('private');
  batch.submit();
  await vi.waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
  expect(calls.failure).toHaveBeenCalledWith('image-1', '写入失败');
  expect(calls.toast).not.toHaveBeenCalled();
  expect(focus).not.toHaveBeenCalled();
});

it('does not Toast unknown results or automatically submit the remaining item', async () => {
  const request = vi.fn().mockRejectedValue(new Error('response lost'));
  vi.stubGlobal('fetch', request);
  const { batch, onRefresh, focus } = mount('public', undefined, 201);
  batch.submit();
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(JSON.parse(request.mock.calls[0][1].body).ids).toHaveLength(200);
  expect(calls.toast).not.toHaveBeenCalled();
  expect(onRefresh).not.toHaveBeenCalled();
  expect(focus).not.toHaveBeenCalled();
});

it('waits for the current list refresh and emits only one completion Toast', async () => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ results: results(['changed', 'unchanged']) }),
      ),
  );
  let finishRefresh!: () => void;
  const onRefresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishRefresh = resolve;
      }),
  );
  const { batch } = mount('public', onRefresh);
  batch.submit();
  batch.submit();
  await vi.waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
  expect(calls.toast).not.toHaveBeenCalled();
  finishRefresh();
  await vi.waitFor(() => expect(calls.toast).toHaveBeenCalledOnce());
});

it('keeps the confirmed write result truthful when refreshing the list fails', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ results: results(['changed', 'unchanged']) }),
      ),
  );
  const onRefresh = vi.fn().mockRejectedValue(new Error('读取列表超时'));
  const { batch, focus } = mount('private', onRefresh);
  batch.submit();
  await vi.waitFor(() => expect(calls.toast).toHaveBeenCalledOnce());
  expect(calls.toast).toHaveBeenCalledWith('批量设为私有完成', {
    description:
      '1张已修改 · 1张无需修改。列表刷新失败：读取列表超时，请刷新页面。',
  });
  expect(calls.remove).toHaveBeenCalledTimes(2);
  expect(calls.failure).not.toHaveBeenCalled();
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
});

const snapshotItem = (id: string): BatchSnapshotItem => ({
  id,
  displayName: `${id}.png`,
  thumbnailUrl: `/i/${id}?type=thumbnail`,
  storage: { id: 'local', name: '本地', enabled: true },
  source: '第2页',
  inCurrentPage: true,
});
const complete = () => ({
  command: { type: 'visibility', visibility: 'public' } as const,
  items: [snapshotItem('image-0'), snapshotItem('image-1')],
  results: results(['changed', 'unchanged']),
  unknownIds: [] as string[],
  unsentIds: [] as string[],
});

it('counts only the valid failed IDs submitted again after an earlier mixed result', () => {
  const retry = complete();
  retry.items = [snapshotItem('image-1')];
  retry.results = [results(['unchanged', 'changed'])[1]];
  expect(batchSuccessFeedback(retry)).toEqual({
    title: '批量设为公开完成',
    description: '1张已修改 · 0张无需修改',
  });
});

it('counts only the final previously unsent item when the other 200 were confirmed before continuing', () => {
  const continued = complete();
  continued.items = [snapshotItem('image-200')];
  continued.results = [
    { id: 'image-200', status: 'changed', message: '已公开', inQuery: true },
  ];
  expect(batchSuccessFeedback(continued)?.description).toBe(
    '1张已修改 · 0张无需修改',
  );
});

it.each([
  'unknown',
  'unsent',
  'valid-failure',
  'invalid-failure',
  'missing-result',
] as const)(
  'does not complete visibility work when it still contains %s',
  (condition) => {
    const workspace = complete();
    if (condition === 'unknown') workspace.unknownIds = ['image-1'];
    if (condition === 'unsent') workspace.unsentIds = ['image-1'];
    if (condition === 'valid-failure' || condition === 'invalid-failure')
      workspace.results[1] = {
        id: 'image-1',
        status: 'failed',
        message: '无法写入',
        inQuery: condition === 'valid-failure',
      };
    if (condition === 'missing-result') workspace.results[1].id = 'other';
    expect(batchSuccessFeedback(workspace)).toBeNull();
  },
);

it('does not apply success Toast feedback to restore or an empty selection', () => {
  expect(
    batchSuccessFeedback({ ...complete(), command: { type: 'restore' } }),
  ).toBeNull();
  expect(
    batchSuccessFeedback({ ...complete(), items: [], results: [] }),
  ).toBeNull();
});

it.each(['public', 'private'] as const)(
  'keeps initial %s confirmation during the request and refresh instead of opening a success summary',
  async (action) => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    let finishRequest!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finishRequest = resolve;
          }),
      ),
    );
    let finishRefresh!: () => void;
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    const { batch } = mount(action, onRefresh, 2, true);
    const phaseDuringRequest = batch.workspace?.phase;
    expect(batch.pending).toBe(true);
    expect(calls.toast).not.toHaveBeenCalled();
    finishRequest(
      Response.json({ results: results(['changed', 'unchanged']) }),
    );
    await vi.waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    expect(calls.toast).not.toHaveBeenCalled();
    finishRefresh();
    await vi.waitFor(() => expect(calls.toast).toHaveBeenCalledOnce());
    expect(phaseDuringRequest).toBe('confirm');
  },
);

it.each(['add-tags', 'remove-tags'] as const)(
  'reports confirmed %s completion with Toast counts and preserves failures',
  (type) => {
    const state = { ...complete(), command: { type, tagIds: ['tag-one'] } };
    expect(batchSuccessFeedback(state)).toEqual({
      title: type === 'add-tags' ? '添加标签完成' : '移除标签完成',
      description: '1张已修改 · 1张无需修改',
    });
    state.results[1] = { ...state.results[1], status: 'failed' };
    expect(batchSuccessFeedback(state)).toBeNull();
  },
);
