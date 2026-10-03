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
