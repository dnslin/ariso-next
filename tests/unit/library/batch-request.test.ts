import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BatchRequestError,
  requestBatch,
} from '../../../src/components/library/batch-request';
import type { BatchItemResult } from '../../../src/server/library/batch-types';

const command = { type: 'visibility', visibility: 'public' } as const;
const ids = Array.from({ length: 401 }, (_, index) => `image-${index}`);
const response = (chunk: string[]) =>
  Response.json({
    results: chunk.map((id) => ({
      id,
      status: 'changed',
      message: '已公开',
      inQuery: true,
    })),
  });
afterEach(() => vi.unstubAllGlobals());
describe('bounded batch client', () => {
  it('uses one fixed explicit query and snapshot in serial 200-item requests', async () => {
    const calls: {
      ids: string[];
      query: string;
      command: typeof command;
      mode: string;
    }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const body = JSON.parse(init.body);
        calls.push(body);
        return response(body.ids);
      }),
    );
    const results: BatchItemResult[] = [];
    expect(
      await requestBatch(
        ids,
        'scope=normal&q=独立数据',
        command,
        'apply',
        new AbortController().signal,
        (items) => results.push(...items),
      ),
    ).toEqual({ unknownIds: [], unsentIds: [], message: '' });
    expect(calls.map((call) => call.ids.length)).toEqual([200, 200, 1]);
    expect(calls.flatMap((call) => call.ids)).toEqual(ids);
    expect(
      calls.every(
        (call) =>
          call.query === 'scope=normal&q=独立数据' &&
          call.mode === 'apply' &&
          call.command.visibility === 'public',
      ),
    ).toBe(true);
    expect(results.map((result) => result.id)).toEqual(ids);
  });
  it('stops after a lost response, preserving unknown and unsent identities without replay', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(ids.slice(0, 200)))
      .mockRejectedValueOnce(new TypeError('connection lost'));
    vi.stubGlobal('fetch', fetch);
    const results: BatchItemResult[] = [];
    const outcome = await requestBatch(
      ids,
      'scope=normal',
      command,
      'apply',
      new AbortController().signal,
      (items) => results.push(...items),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(200);
    expect(outcome.unknownIds).toEqual(ids.slice(200, 400));
    expect(outcome.unsentIds).toEqual(ids.slice(400));
  });
  it('checks actual state with a read-only command after an unknown response', async () => {
    const fetch = vi.fn().mockResolvedValue(response(['image-1']));
    vi.stubGlobal('fetch', fetch);
    await requestBatch(
      ['image-1'],
      'scope=normal',
      command,
      'check',
      new AbortController().signal,
      () => {},
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      mode: 'check',
      ids: ['image-1'],
      command,
    });
  });
  it('keeps server rejection distinct from an unknown response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: '登录已失效' }, { status: 401 }),
        ),
    );
    await expect(
      requestBatch(
        ids,
        'scope=normal',
        command,
        'apply',
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toMatchObject({
      status: 401,
      message: '登录已失效',
    } satisfies Partial<BatchRequestError>);
  });
  it('cancellation prevents the next request while retaining already received results', async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockResolvedValue(response(ids.slice(0, 200)));
    vi.stubGlobal('fetch', fetch);
    const results: BatchItemResult[] = [];
    await expect(
      requestBatch(
        ids,
        'scope=normal',
        command,
        'apply',
        controller.signal,
        (items) => {
          results.push(...items);
          controller.abort();
        },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(200);
  });
});

it('trims exact task identities to each 200-item request and keeps them unchanged for checks', async () => {
  const command = {
    type: 'reprocess' as const,
    scope: 'watermark' as const,
    taskIds: Object.fromEntries(ids.map((id, index) => [id, `task-${index}`])),
  };
  const calls: { ids: string[]; command: typeof command; mode: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      return response(body.ids);
    }),
  );
  for (const mode of ['apply', 'check'] as const)
    await requestBatch(
      ids,
      'scope=normal',
      command,
      mode,
      new AbortController().signal,
      () => {},
    );
  expect(calls.map((call) => call.ids.length)).toEqual([
    200, 200, 1, 200, 200, 1,
  ]);
  for (const call of calls) {
    expect(Object.keys(call.command.taskIds)).toEqual(call.ids);
    expect(call.command.taskIds).toEqual(
      Object.fromEntries(call.ids.map((id) => [id, command.taskIds[id]])),
    );
  }
});

it('does not submit the next chunk when the server cannot confirm an exact reprocess task', async () => {
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      results: [
        {
          id: ids[0],
          status: 'unknown',
          code: 'LIBRARY_BATCH_TASK_UNCONFIRMED',
          message: '原任务尚未找到',
          inQuery: true,
        },
        ...ids.slice(1, 200).map((id) => ({
          id,
          status: 'accepted',
          inQuery: true,
          message: '已受理',
        })),
      ],
    }),
  );
  vi.stubGlobal('fetch', fetch);
  const received: BatchItemResult[] = [];
  const outcome = await requestBatch(
    ids,
    'scope=normal',
    {
      type: 'reprocess',
      scope: 'all',
      taskIds: Object.fromEntries(ids.map((id) => [id, `task-${id}`])),
    },
    'apply',
    new AbortController().signal,
    (results) => received.push(...results),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(received).toHaveLength(200);
  expect(outcome.unknownIds).toEqual([ids[0]]);
  expect(outcome.unsentIds).toEqual(ids.slice(200));
});

it('checks every read-only chunk and retains only identities still unconfirmed', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const { ids } = JSON.parse(init.body);
      return Response.json({
        results: ids.map((id: string) => ({
          id,
          status:
            id === 'image-0' || id === 'image-400' ? 'unknown' : 'accepted',
          inQuery: true,
          message: '核对',
        })),
      });
    }),
  );
  const outcome = await requestBatch(
    ids,
    'scope=normal',
    {
      type: 'reprocess',
      scope: 'all',
      taskIds: Object.fromEntries(ids.map((id) => [id, `task-${id}`])),
    },
    'check',
    new AbortController().signal,
    () => {},
  );
  expect(outcome.unknownIds).toEqual(['image-0', 'image-400']);
  expect(outcome.unsentIds).toEqual([]);
});
