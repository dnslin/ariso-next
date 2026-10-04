import { afterEach, expect, it, vi } from 'vitest';
import {
  requestCopy,
  writeCopyText,
} from '../../../src/components/library/copy-request';

afterEach(() => vi.unstubAllGlobals());
it('splits 201 explicit items and merges shuffled equal-key rows by query order', async () => {
  const ids = Array.from(
    { length: 201 },
    (_, i) => `image-${String(i).padStart(3, '0')}`,
  );
  const fetch = vi.fn(async (_url, init) => {
    const request = JSON.parse(init.body);
    return Response.json({
      items: request.ids.toReversed().map((id: string) => ({
        imageId: id,
        sortKey: { value: 42, id },
        line: `https://example.test/i/${id}`,
      })),
      unavailable: [],
      sort: 'size_desc',
    });
  });
  vi.stubGlobal('fetch', fetch);
  const request = {
    ids,
    query: 'scope=normal&sort=size_desc',
    version: 'default' as const,
    format: 'url' as const,
  };
  const result = await requestCopy(request, new AbortController().signal);
  expect(result.items.map((item) => item.imageId)).toEqual(ids);
  expect(result.text.split('\n')).toEqual(
    ids.map((id) => `https://example.test/i/${id}`),
  );
  expect(
    fetch.mock.calls.map((call) => JSON.parse(call[1].body).ids.length),
  ).toEqual([200, 1]);
  for (const call of fetch.mock.calls)
    expect(JSON.parse(call[1].body)).toMatchObject({
      query: request.query,
      version: 'default',
      format: 'url',
    });
});
it('keeps unavailable records distinct from an HTTP error after an earlier chunk', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          items: [],
          unavailable: [{ imageId: 'image', reason: '存储已停用' }],
          sort: 'uploaded_desc',
        }),
      )
      .mockResolvedValueOnce(new Response('', { status: 401 })),
  );
  await expect(
    requestCopy(
      {
        ids: Array.from({ length: 201 }, (_, i) => String(i)),
        query: '',
        version: 'default',
        format: 'url',
      },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ status: 401 });
});
it('does not replace an existing clipboard when all records are unavailable', async () => {
  const writeText = vi.fn();
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  expect(await writeCopyText('')).toBe('empty');
  expect(writeText).not.toHaveBeenCalled();
});
it('returns manual mode with complete text after a browser rejection', async () => {
  const writeText = vi.fn().mockRejectedValue(new Error('not allowed'));
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  const text = 'line1\nline2';
  expect(await writeCopyText(text)).toBe('manual');
  expect(writeText).toHaveBeenCalledWith(text);
});
it('only reports copied after the browser finishes writing', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  expect(await writeCopyText('one')).toBe('copied');
});

it.each([
  'uploaded_asc',
  'uploaded_desc',
  'size_asc',
  'size_desc',
  'joined_desc',
])(
  'uses %s primary order with a BINARY ID tie-break across Unicode',
  async (sort) => {
    const rows = [
      { id: 'small', value: 1 },
      { id: '\u{10000}', value: 42 },
      { id: '\ue000', value: 42 },
      { id: 'big', value: 99 },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          items: rows.map(({ id, value }) => ({
            imageId: id,
            sortKey: { value, id },
            line: id,
          })),
          unavailable: [],
          sort,
        }),
      ),
    );
    const result = await requestCopy(
      {
        ids: rows.map((row) => row.id),
        query:
          sort === 'joined_desc'
            ? 'scope=album&albumId=album'
            : `scope=normal&sort=${sort}`,
        version: 'default',
        format: 'url',
      },
      new AbortController().signal,
    );
    expect(result.items.map((item) => item.imageId)).toEqual(
      sort.endsWith('desc')
        ? ['big', '\ue000', '\u{10000}', 'small']
        : ['small', '\ue000', '\u{10000}', 'big'],
    );
  },
);

it('preserves HTTP 401 from a null response for session cleanup', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json(null, { status: 401 })),
  );
  await expect(
    requestCopy(
      { ids: ['image'], query: '', version: 'default', format: 'url' },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ status: 401 });
});

it('stops before another chunk or clipboard write when the request is aborted', async () => {
  const controller = new AbortController();
  const fetch = vi.fn(async () => {
    controller.abort();
    return Response.json({ items: [], unavailable: [], sort: 'uploaded_desc' });
  });
  const writeText = vi.fn();
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  await expect(
    requestCopy(
      {
        ids: Array.from({ length: 201 }, (_, i) => String(i)),
        query: '',
        version: 'default',
        format: 'url',
      },
      controller.signal,
    ).then((result) => writeCopyText(result.text)),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(writeText).not.toHaveBeenCalled();
});
