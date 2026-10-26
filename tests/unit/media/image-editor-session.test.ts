import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageEditSession } from '../../../src/components/image-editor/session';
import { emptyImageEditRecipe } from '../../../src/shared/image-editing';

const intent = {
  requestId: 'request-one',
  sourceImageId: 'image-one',
  sourceObjectId: 'object-one',
  mode: 'copy' as const,
  recipe: emptyImageEditRecipe(),
};
const accepted = {
  requestId: intent.requestId,
  jobId: 'job-one',
  sourceImageId: intent.sourceImageId,
  resultImageId: 'image-result',
  mode: 'copy',
  status: 'succeeded',
  step: 'complete',
  error: null,
  finishedAt: '2026-10-25T00:00:00.000Z',
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('image editing submission reconciliation', () => {
  it('queries the frozen request after a lost response and never submits a second copy', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network disconnected'))
      .mockResolvedValueOnce(Response.json(accepted));
    vi.stubGlobal('fetch', fetcher);
    const session = new ImageEditSession(intent, intent);
    await session.submit();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe('/api/images/image-one/edit');
    expect(JSON.parse(fetcher.mock.calls[0][1].body).requestId).toBe(
      intent.requestId,
    );
    expect(fetcher.mock.calls[1][0]).toBe('/api/media/edits/request-one');
    expect(session.getSnapshot().job?.resultImageId).toBe('image-result');
    await session.submit();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('keeps an unknown result on 5xx while an exact 404 allows deliberate same-id resubmission', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(
        Response.json({ message: 'busy' }, { status: 503 }),
      )
      .mockResolvedValueOnce(
        Response.json({ message: 'not found' }, { status: 404 }),
      )
      .mockResolvedValueOnce(Response.json(accepted));
    vi.stubGlobal('fetch', fetcher);
    const session = new ImageEditSession(intent, intent);
    await session.submit();
    expect(session.getSnapshot().phase).toBe('unknown');
    await session.read();
    expect(session.getSnapshot().phase).toBe('not_accepted');
    await session.retry();
    expect(JSON.parse(fetcher.mock.calls[3][1].body).requestId).toBe(
      'request-one',
    );
    expect(session.getSnapshot().job?.status).toBe('succeeded');
  });
  it('retries an accepted failed job by request id rather than posting another edit', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ ...accepted, status: 'failed', error: 'disk full' }),
      )
      .mockResolvedValueOnce(Response.json(accepted));
    vi.stubGlobal('fetch', fetcher);
    const session = new ImageEditSession(intent, intent);
    await session.submit();
    await session.retry();
    expect(fetcher.mock.calls[1][0]).toBe('/api/media/edits/request-one/retry');
    expect(session.getSnapshot().job?.resultImageId).toBe('image-result');
  });
  it('submits the frozen recipe even when the editor draft changes afterwards', async () => {
    const recipe = emptyImageEditRecipe();
    recipe.watermark.text = 'first';
    const frozen = { ...intent, recipe };
    const session = new ImageEditSession(frozen, frozen);
    recipe.watermark.text = 'later draft';
    const fetcher = vi.fn().mockResolvedValue(Response.json(accepted));
    vi.stubGlobal('fetch', fetcher);
    await session.submit();
    expect(
      JSON.parse(fetcher.mock.calls[0][1].body).recipe.watermark.text,
    ).toBe('first');
  });
  it('reports the successful overwrite identity to its source refresh callback once', async () => {
    const complete = vi.fn();
    const job = {
      ...accepted,
      mode: 'overwrite',
      resultImageId: intent.sourceImageId,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(Response.json(job))),
    );
    const session = new ImageEditSession(
      { ...intent, mode: 'overwrite' },
      { ...intent, mode: 'overwrite' },
      complete,
    );
    await session.submit();
    await session.read();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'overwrite',
        sourceImageId: intent.sourceImageId,
        resultImageId: intent.sourceImageId,
      }),
    );
  });
  it.each(['submit', 'read', 'retry'] as const)(
    'expires the owner session on a %s 401 without automatic replay',
    async (action) => {
      const expire = vi.fn();
      const unauthorized = () =>
        Response.json(
          { code: 'UNAUTHORIZED', message: '登录已失效' },
          { status: 401 },
        );
      const fetcher = vi.fn();
      vi.stubGlobal('fetch', fetcher);
      const session = new ImageEditSession(
        intent,
        intent,
        () => undefined,
        expire,
      );
      if (action === 'retry') {
        fetcher.mockResolvedValueOnce(
          Response.json({ ...accepted, status: 'failed' }),
        );
        await session.submit();
        fetcher
          .mockResolvedValueOnce(unauthorized())
          .mockResolvedValueOnce(unauthorized());
        await session.retry();
      } else {
        fetcher.mockResolvedValue(unauthorized());
        await session[action]();
      }
      expect(expire).toHaveBeenCalled();
      expect(session.getSnapshot().job?.status).not.toBe('succeeded');
      expect(
        fetcher.mock.calls.filter(
          (call) => call[0] === '/api/images/image-one/edit',
        ),
      ).toHaveLength(action === 'read' ? 0 : 1);
    },
  );
});
