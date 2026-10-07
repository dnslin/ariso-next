import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ShareSession } from '../../../src/components/sharing/share-session';
import type {
  PublicShareItem,
  PublicShareNeighbors,
  PublicSharePage,
  PublicShareRefresh,
} from '../../../src/server/sharing/public-types';

const sessions: ShareSession[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  for (const session of sessions.splice(0)) session.stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function transport() {
  const requests: {
    url: string;
    init: RequestInit;
    result: ReturnType<typeof deferred<Response>>;
  }[] = [];
  const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const result = deferred<Response>();
    requests.push({ url: String(input), init: init ?? {}, result });
    // Deliberately permits late completion even after AbortSignal, as a decoded body can do.
    return result.promise;
  }) as unknown as typeof fetch;
  const respond = (index: number, body: object, status = 200) =>
    requests[index].result.resolve(Response.json(body, { status }));
  return { fetcher, requests, respond };
}
const item = (
  imageId: string,
  status: PublicShareItem['status'] = 'ready',
): PublicShareItem => ({
  imageId,
  aspectRatio: 1.5,
  status,
  thumbnailUrl: status === 'ready' ? `/i/${imageId}?type=thumbnail` : null,
  previewUrl: status === 'ready' ? `/i/${imageId}?type=compressed` : null,
  displayName: `name-${imageId}`,
});
const items = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) => item(`image-${offset + index}`));
const page = (
  members: PublicShareItem[] = items(40),
  overrides: Partial<PublicSharePage> = {},
): PublicSharePage => ({
  albumName: '真实相册',
  description: '纯文本',
  layout: 'grid',
  showName: true,
  total: 200,
  cover: members[0] ?? null,
  items: members,
  nextCursor: members.at(-1)?.imageId ?? null,
  hasMore: true,
  ...overrides,
});
function refreshed(
  source: PublicSharePage,
  members = source.items,
): PublicShareRefresh {
  return {
    albumName: source.albumName,
    description: source.description,
    layout: source.layout,
    showName: source.showName,
    total: source.total,
    cover: source.cover,
    items: members,
  };
}
function session(initial: PublicSharePage, fetcher: typeof fetch) {
  const value = new ShareSession(
    'capability-token',
    { status: 200, page: initial },
    fetcher,
  );
  sessions.push(value);
  return value;
}
function neighbors(
  current: PublicShareItem | null,
  previous: PublicShareItem | null = null,
  next: PublicShareItem | null = null,
  overrides: Partial<PublicShareNeighbors> = {},
): PublicShareNeighbors {
  return {
    current,
    previous,
    next,
    showName: true,
    total: 200,
    position: current ? 1 : null,
    ...overrides,
  };
}
async function flush() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}

it('opens only readable loaded cards, seeds the current item and reads anonymous neighbors by ID', async () => {
  const http = transport();
  const readable = { ...item('readable/图'), status: 'missing' as const };
  const initial = page([readable, item('processing', 'processing')]);
  const value = session(initial, http.fetcher);
  await value.openViewer('unknown');
  await value.openViewer('processing');
  expect(http.requests).toHaveLength(0);
  const opening = value.openViewer(readable.imageId);
  expect(value.getSnapshot()).toMatchObject({
    viewer: { current: readable, previous: null, next: null },
    viewerLoading: true,
    viewerError: '',
  });
  expect(http.requests[0].url).toBe(
    '/s/capability-token/items?imageId=readable%2F%E5%9B%BE',
  );
  http.respond(0, neighbors(readable, null, item('off-page')));
  await opening;
  expect(value.getSnapshot()).toMatchObject({
    viewer: { current: readable, next: item('off-page') },
    viewerLoading: false,
  });
  expect(value.getSnapshot().page).toBe(initial);
});

it('cross-page navigation retains the current image on failure and retries the same target without changing its version', async () => {
  const http = transport();
  const value = session(page([item('first')]), http.fetcher);
  const opening = value.openViewer('first');
  const second = item('second');
  http.respond(0, neighbors(item('first'), null, second));
  await opening;
  const navigating = value.navigateViewer('next');
  expect(value.getSnapshot().viewer?.current?.imageId).toBe('first');
  expect(http.requests[1].url).toBe('/s/capability-token/items?imageId=second');
  http.respond(1, {}, 503);
  await navigating;
  expect(value.getSnapshot()).toMatchObject({
    viewer: { current: item('first'), next: second },
    viewerLoading: false,
  });
  expect(value.getSnapshot().viewerError).not.toBe('');
  const retrying = value.retryViewer();
  expect(http.requests[2].url).toBe(http.requests[1].url);
  http.respond(2, neighbors(second, item('first'), item('third', 'disabled')));
  await retrying;
  expect(value.getSnapshot()).toMatchObject({
    viewer: { current: second, next: item('third', 'disabled') },
    viewerError: '',
  });
  const placeholder = value.navigateViewer('next');
  http.respond(3, neighbors(item('third', 'disabled'), second));
  await placeholder;
  expect(value.getSnapshot().viewer?.current).toEqual(
    item('third', 'disabled'),
  );
  await value.navigateViewer('next');
  expect(http.requests).toHaveLength(4);
});

it.each(['close', 'stop'] as const)(
  '%s cancels a decoded neighbor response and never restores a removed viewer',
  async (action) => {
    const http = transport();
    const value = session(page([item('first')]), http.fetcher);
    const opening = value.openViewer('first');
    const json = deferred<PublicShareNeighbors>();
    const response = Response.json({});
    vi.spyOn(response, 'json').mockImplementation(() => json.promise);
    http.requests[0].result.resolve(response);
    await flush();
    if (action === 'close') value.closeViewer();
    else value.stop();
    expect(http.requests[0].init.signal?.aborted).toBe(true);
    json.resolve(neighbors(item('first'), null, item('second')));
    await opening;
    expect(value.getSnapshot()).toMatchObject({
      viewer: null,
      viewerLoading: false,
      viewerError: '',
    });
  },
);

it.each([401, 404, 410])(
  'viewer HTTP %s clears all anonymous data and cancels list and refresh requests',
  async (status) => {
    const http = transport();
    const value = session(page([item('first')]), http.fetcher);
    const opening = value.openViewer('first');
    const load = value.loadMore();
    const checking = value.refresh();
    http.respond(0, {}, status);
    await opening;
    expect(value.getSnapshot()).toMatchObject({
      status,
      page: null,
      viewer: null,
      viewerLoading: false,
      revoked: true,
    });
    expect(http.requests.every((request) => request.init.signal?.aborted)).toBe(
      true,
    );
    http.respond(1, page([item('late-list')]));
    http.respond(2, refreshed(page([item('late-refresh')])));
    await Promise.all([load, checking]);
    expect(value.getSnapshot().page).toBeNull();
    expect(value.getSnapshot().viewer).toBeNull();
  },
);

it('refreshes the union of loaded and three viewer IDs in bounded batches, then re-reads current neighbors and order', async () => {
  const http = transport();
  const initial = page(items(79));
  const value = session(initial, http.fetcher);
  const opening = value.openViewer('image-78');
  http.respond(
    0,
    neighbors(item('image-78'), item('image-77'), item('image-79')),
  );
  await opening;
  const navigating = value.navigateViewer('next');
  http.respond(
    1,
    neighbors(item('image-79'), item('image-78'), item('image-80')),
  );
  await navigating;
  const checking = value.refresh();
  expect(JSON.parse(String(http.requests[2].init.body))).toEqual({
    ids: [...initial.items.map((entry) => entry.imageId), 'image-79'],
  });
  http.respond(
    2,
    refreshed(initial, [...initial.items, item('image-79', 'disabled')]),
  );
  await flush();
  expect(value.getSnapshot().viewer?.current).toEqual(
    item('image-79', 'disabled'),
  );
  expect(JSON.parse(String(http.requests[3].init.body))).toEqual({
    ids: ['image-80'],
  });
  http.respond(3, refreshed(initial, [item('image-80')]));
  await flush();
  expect(http.requests[4].url).toBe(
    '/s/capability-token/items?imageId=image-79',
  );
  http.respond(
    4,
    neighbors(
      item('image-79', 'disabled'),
      item('newly-added'),
      item('image-78'),
      { total: 201, position: 2 },
    ),
  );
  await checking;
  expect(value.getSnapshot()).toMatchObject({
    viewer: {
      previous: item('newly-added'),
      next: item('image-78'),
      total: 201,
      position: 2,
    },
    refreshing: false,
  });
  expect(value.getSnapshot().page?.items).toHaveLength(79);
});

it('current removal returns to the list and ignores a late navigation response', async () => {
  const http = transport();
  const initial = page([item('first'), item('second')]);
  const value = session(initial, http.fetcher);
  const opening = value.openViewer('first');
  http.respond(0, neighbors(item('first'), null, item('second')));
  await opening;
  const navigating = value.navigateViewer('next');
  const checking = value.refresh();
  http.respond(2, refreshed(initial, [item('second')]));
  await checking;
  expect(value.getSnapshot().viewer).toBeNull();
  expect(value.getSnapshot().page?.items).toEqual([item('second')]);
  expect(http.requests[1].init.signal?.aborted).toBe(true);
  http.respond(1, neighbors(item('second')));
  await navigating;
  expect(value.getSnapshot().viewer).toBeNull();
});

it('removal of an off-page neighbor cancels its pending navigation and re-reads the displayed image', async () => {
  const http = transport();
  const initial = page([item('first')]);
  const value = session(initial, http.fetcher);
  const opening = value.openViewer('first');
  http.respond(0, neighbors(item('first'), null, item('off-page')));
  await opening;
  const navigating = value.navigateViewer('next');
  const checking = value.refresh();
  http.respond(2, refreshed(initial));
  await flush();
  expect(http.requests[1].init.signal?.aborted).toBe(true);
  expect(value.getSnapshot().viewer?.current?.imageId).toBe('first');
  expect(http.requests[3].url).toBe('/s/capability-token/items?imageId=first');
  http.respond(3, neighbors(item('first')));
  await checking;
  http.respond(1, neighbors(item('off-page')));
  await navigating;
  expect(value.getSnapshot().viewer?.current?.imageId).toBe('first');
});

it('a removed navigation target preserves the displayed image and recovers its fresh neighbors', async () => {
  const http = transport();
  const value = session(page([item('first')]), http.fetcher);
  const opening = value.openViewer('first');
  http.respond(0, neighbors(item('first'), null, item('gone')));
  await opening;
  const navigating = value.navigateViewer('next');
  http.respond(1, neighbors(null));
  await flush();
  expect(value.getSnapshot().viewer?.current?.imageId).toBe('first');
  expect(http.requests[2].url).toBe('/s/capability-token/items?imageId=first');
  http.respond(2, neighbors(item('first'), null, item('new-next')));
  await navigating;
  expect(value.getSnapshot()).toMatchObject({
    viewer: { current: item('first'), next: item('new-next') },
    viewerError: '',
    viewerLoading: false,
  });
});

it('a missing current neighbor response removes its loaded card and stale cover before returning to the list', async () => {
  const http = transport();
  const value = session(page([item('first'), item('second')]), http.fetcher);
  const opening = value.openViewer('first');
  http.respond(0, neighbors(null, null, null, { total: 199 }));
  await opening;
  expect(value.getSnapshot()).toMatchObject({
    viewer: null,
    page: { items: [item('second')], cover: null, total: 199 },
  });
});

it('successful navigation cancels a status batch for the old displayed and neighboring identities', async () => {
  const http = transport();
  const initial = page([item('first')]);
  const value = session(initial, http.fetcher);
  const opening = value.openViewer('first');
  http.respond(0, neighbors(item('first'), null, item('second')));
  await opening;
  const checking = value.refresh();
  const navigating = value.navigateViewer('next');
  http.respond(2, neighbors(item('second'), item('first'), item('third')));
  await navigating;
  expect(http.requests[1].init.signal?.aborted).toBe(true);
  http.respond(1, refreshed(initial, []));
  await checking;
  expect(value.getSnapshot().page?.items).toEqual([item('first')]);
  expect(value.getSnapshot().viewer?.current?.imageId).toBe('second');
});

it('background neighbor polling preserves a failed navigation target and its error until explicit retry', async () => {
  const http = transport();
  const initial = page([item('first')]);
  const value = session(initial, http.fetcher);
  const opening = value.openViewer('first');
  http.respond(0, neighbors(item('first'), null, item('second')));
  await opening;
  const navigating = value.navigateViewer('next');
  http.respond(1, {}, 500);
  await navigating;
  const error = value.getSnapshot().viewerError;
  const checking = value.refresh();
  http.respond(2, refreshed(initial, [item('first'), item('second')]));
  await flush();
  http.respond(3, neighbors(item('first'), null, item('second')));
  await checking;
  expect(value.getSnapshot().viewerError).toBe(error);
  const retrying = value.retryViewer();
  expect(http.requests[4].url).toBe('/s/capability-token/items?imageId=second');
  http.respond(4, neighbors(item('second'), item('first')));
  await retrying;
  expect(value.getSnapshot().viewerError).toBe('');
});

it('a hidden name policy strips every viewer item and cancels late named neighbors and pagination', async () => {
  const http = transport();
  const initial = page([item('first')]);
  const value = session(initial, http.fetcher);
  const opening = value.openViewer('first');
  http.respond(0, neighbors(item('first'), item('before'), item('after')));
  await opening;
  const navigating = value.navigateViewer('next');
  const load = value.loadMore();
  const checking = value.refresh();
  const hidden = page([item('first')], { showName: false });
  http.respond(
    3,
    refreshed(hidden, [item('first'), item('before'), item('after')]),
  );
  await flush();
  expect(http.requests[1].init.signal?.aborted).toBe(true);
  expect(http.requests[2].init.signal?.aborted).toBe(true);
  expect(JSON.stringify(value.getSnapshot())).not.toContain('displayName');
  expect(http.requests[4].url).toBe('/s/capability-token/items?imageId=first');
  http.respond(
    4,
    neighbors(item('first'), item('before'), item('after'), {
      showName: false,
    }),
  );
  await checking;
  http.respond(1, neighbors(item('after'), item('first'), item('later')));
  http.respond(2, page([item('late')]));
  await Promise.all([navigating, load]);
  expect(value.getSnapshot().viewer?.current?.imageId).toBe('first');
  expect(JSON.stringify(value.getSnapshot())).not.toContain('displayName');
});

it('a completed append cancels pending neighbors for the former loaded ID batch', async () => {
  const http = transport();
  const initial = page([item('first')]);
  const value = session(initial, http.fetcher);
  const opening = value.openViewer('first');
  http.respond(0, neighbors(item('first'), null, item('second')));
  await opening;
  const navigating = value.navigateViewer('next');
  const load = value.loadMore();
  http.respond(2, page([item('second'), item('third')]));
  await load;
  expect(http.requests[1].init.signal?.aborted).toBe(true);
  expect(value.getSnapshot().viewerLoading).toBe(false);
  http.respond(1, neighbors(item('second'), item('first'), item('third')));
  await navigating;
  expect(value.getSnapshot().viewer?.current?.imageId).toBe('first');
  expect(value.getSnapshot().page?.items.map((entry) => entry.imageId)).toEqual(
    ['first', 'second', 'third'],
  );
});

it('a neighbor response that hides names strips the loaded page immediately and cancels its old append', async () => {
  const http = transport();
  const value = session(page([item('first')]), http.fetcher);
  const opening = value.openViewer('first');
  const load = value.loadMore();
  http.respond(
    0,
    neighbors(item('first'), item('before'), item('after'), {
      showName: false,
    }),
  );
  await opening;
  expect(http.requests[1].init.signal?.aborted).toBe(true);
  expect(JSON.stringify(value.getSnapshot())).not.toContain('displayName');
  http.respond(1, page([item('late-named')]));
  await load;
  expect(JSON.stringify(value.getSnapshot())).not.toContain('displayName');
});

it('visibility also pauses neighbor polling and resumes one combined refresh cycle immediately', async () => {
  const http = transport();
  const initial = page([item('first')]);
  const value = session(initial, http.fetcher);
  const opening = value.openViewer('first');
  http.respond(0, neighbors(item('first'), null, item('second')));
  await opening;
  value.setVisible(true);
  http.respond(1, refreshed(initial, [item('first'), item('second')]));
  await flush();
  expect(http.requests[2].url).toBe('/s/capability-token/items?imageId=first');
  value.setVisible(false);
  expect(http.requests[2].init.signal?.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(10000);
  expect(http.requests).toHaveLength(3);
  value.setVisible(true);
  value.setVisible(true);
  expect(http.requests).toHaveLength(4);
  expect(JSON.parse(String(http.requests[3].init.body))).toEqual({
    ids: ['first', 'second'],
  });
  http.respond(2, neighbors(item('first'), null, item('late')));
  http.respond(3, refreshed(initial, [item('first'), item('second')]));
  await flush();
  http.respond(4, neighbors(item('first'), null, item('second')));
  await flush();
  expect(value.getSnapshot().viewer?.next?.imageId).toBe('second');
  await vi.advanceTimersByTimeAsync(5000);
  expect(http.requests).toHaveLength(6);
  await vi.advanceTimersByTimeAsync(15000);
  expect(http.requests).toHaveLength(6);
});

it('calls the default global transport without binding it to the session', async () => {
  const nativeLikeFetch = vi.fn(function (this: unknown) {
    if (this instanceof ShareSession) throw new TypeError('Illegal invocation');
    return Promise.resolve(Response.json(page(items(40, 40))));
  });
  vi.stubGlobal('fetch', nativeLikeFetch);
  const value = new ShareSession('capability-token', {
    status: 200,
    page: page(),
  });
  sessions.push(value);
  await value.loadMore();
  expect(nativeLikeFetch).toHaveBeenCalledOnce();
  expect(value.getSnapshot().page?.items).toHaveLength(80);
  expect(value.getSnapshot().loadError).toBe('');
});

it('keeps a stable external-store snapshot, deduplicates overlapping pages in server order and uses only the ID cursor', async () => {
  const http = transport();
  const value = session(page(), http.fetcher);
  const snapshot = value.getSnapshot;
  const subscribe = value.subscribe;
  const listener = vi.fn();
  const unsubscribe = subscribe(listener);
  expect(snapshot()).toBe(snapshot());
  const pending = value.loadMore();
  await value.loadMore();
  expect(http.requests).toHaveLength(1);
  expect(http.requests[0].url).toBe(
    '/s/capability-token/items?cursor=image-39',
  );
  http.respond(0, page(items(40, 35), { nextCursor: 'image-74' }));
  await pending;
  expect(snapshot().page?.items.map((entry) => entry.imageId)).toEqual(
    items(75).map((entry) => entry.imageId),
  );
  expect(snapshot().page?.nextCursor).toBe('image-74');
  expect(snapshot().loading).toBe(false);
  expect(listener).toHaveBeenCalled();
  expect(value.getSnapshot).toBe(snapshot);
  expect(value.subscribe).toBe(subscribe);
  unsubscribe();
  listener.mockClear();
  value.setUnavailable(404);
  expect(listener).not.toHaveBeenCalled();
});

it('refreshes 161 independent IDs as sequential 80/80/1 batches without overlapping refreshes', async () => {
  const http = transport();
  const initial = page(items(161));
  const value = session(initial, http.fetcher);
  const pending = value.refresh();
  await value.refresh();
  expect(http.requests).toHaveLength(1);
  for (const [index, start, size] of [
    [0, 0, 80],
    [1, 80, 80],
    [2, 160, 1],
  ]) {
    const requested = JSON.parse(String(http.requests[index].init.body));
    expect(requested).toEqual({
      ids: initial.items
        .slice(start, start + size)
        .map((entry) => entry.imageId),
    });
    expect(http.requests[index].init).toMatchObject({
      method: 'POST',
      cache: 'no-store',
    });
    http.respond(
      index,
      refreshed(initial, initial.items.slice(start, start + size)),
    );
    await flush();
    expect(http.requests).toHaveLength(index + 1 + Number(index < 2));
  }
  await pending;
  expect(value.getSnapshot()).toMatchObject({
    refreshing: false,
    refreshError: '',
    page: { items: initial.items },
  });
});

it('an empty loaded album still checks permission with one empty ID batch', async () => {
  const http = transport();
  const initial = page([], { total: 0, hasMore: false });
  const value = session(initial, http.fetcher);
  const pending = value.refresh();
  expect(JSON.parse(String(http.requests[0].init.body))).toEqual({ ids: [] });
  http.respond(0, refreshed(initial));
  await pending;
  expect(value.getSnapshot().page?.items).toEqual([]);
});

it.each([401, 404, 410])(
  'status %s clears the entire album, errors and cursor while discarding a late list JSON',
  async (status) => {
    const http = transport();
    const value = session(page(), http.fetcher);
    const load = value.loadMore();
    const json = deferred<PublicSharePage>();
    const response = Response.json({});
    vi.spyOn(response, 'json').mockImplementation(() => json.promise);
    http.requests[0].result.resolve(response);
    await flush();
    const checking = value.refresh();
    http.respond(1, { code: 'SHARING_UNAVAILABLE' }, status);
    await checking;
    expect(http.requests[0].init.signal?.aborted).toBe(true);
    expect(value.getSnapshot()).toMatchObject({
      status,
      page: null,
      loading: false,
      refreshing: false,
      loadError: '',
      refreshError: '',
      cursorInvalid: false,
      revoked: true,
    });
    json.resolve(page(items(40, 40)));
    await load;
    expect(value.getSnapshot().page).toBeNull();
  },
);

it('showName and layout changes strip every previously loaded name and cover, abort stale load and restart remaining batches next cycle', async () => {
  const http = transport();
  const initial = page(items(120));
  const value = session(initial, http.fetcher);
  const load = value.loadMore();
  const json = deferred<PublicSharePage>();
  const late = Response.json({});
  vi.spyOn(late, 'json').mockImplementation(() => json.promise);
  http.requests[0].result.resolve(late);
  await flush();
  const checking = value.refresh();
  const updated = page(
    initial.items.slice(0, 80).map((entry) => {
      const unnamed = { ...entry };
      delete unnamed.displayName;
      return unnamed;
    }),
    {
      showName: false,
      layout: 'masonry',
      cover: {
        imageId: 'image-0',
        aspectRatio: 1.5,
        status: 'ready',
        thumbnailUrl: '/i/image-0?type=thumbnail',
        previewUrl: '/i/image-0?type=compressed',
      },
    },
  );
  http.respond(1, refreshed(updated));
  await checking;
  expect(http.requests).toHaveLength(2);
  expect(http.requests[0].init.signal?.aborted).toBe(true);
  expect(value.getSnapshot().page).toMatchObject({
    showName: false,
    layout: 'masonry',
  });
  expect(JSON.stringify(value.getSnapshot().page)).not.toContain('displayName');
  json.resolve(page(items(40, 120)));
  await load;
  expect(value.getSnapshot().page?.items).toHaveLength(120);
  expect(JSON.stringify(value.getSnapshot().page)).not.toContain('name-image');
  const next = value.refresh();
  http.respond(2, refreshed(updated));
  await flush();
  expect(JSON.parse(String(http.requests[3].init.body))).toEqual({
    ids: initial.items.slice(80).map((entry) => entry.imageId),
  });
  http.respond(
    3,
    refreshed(
      updated,
      initial.items.slice(80).map((entry) => {
        const unnamed = { ...entry };
        delete unnamed.displayName;
        return unnamed;
      }),
    ),
  );
  await next;
});

it('a refresh removes absent IDs, updates placeholders in place and cancels an append based on the old collection', async () => {
  const http = transport();
  const initial = page(
    ['ready', 'pending', 'failed', 'disabled', 'missing'].map((id, index) =>
      item(
        id,
        ['ready', 'processing', 'failed', 'disabled', 'missing'][
          index
        ] as PublicShareItem['status'],
      ),
    ),
  );
  const value = session(initial, http.fetcher);
  const load = value.loadMore();
  const checking = value.refresh();
  http.respond(
    1,
    refreshed(initial, [
      item('pending'),
      item('failed', 'failed'),
      item('disabled', 'disabled'),
      item('missing', 'missing'),
    ]),
  );
  await checking;
  expect(
    value
      .getSnapshot()
      .page?.items.map((entry) => [entry.imageId, entry.status]),
  ).toEqual([
    ['pending', 'ready'],
    ['failed', 'failed'],
    ['disabled', 'disabled'],
    ['missing', 'missing'],
  ]);
  expect(http.requests[0].init.signal?.aborted).toBe(true);
  http.respond(0, page([item('ready'), item('new')]));
  await load;
  expect(value.getSnapshot().page?.items.map((entry) => entry.imageId)).toEqual(
    ['pending', 'failed', 'disabled', 'missing'],
  );
});

it('a completed append cancels an old status response so newly loaded IDs are checked only in a new cycle', async () => {
  const http = transport();
  const initial = page(items(40));
  const value = session(initial, http.fetcher);
  const checking = value.refresh();
  const json = deferred<PublicShareRefresh>();
  const response = Response.json({});
  vi.spyOn(response, 'json').mockImplementation(() => json.promise);
  http.requests[0].result.resolve(response);
  await flush();
  const load = value.loadMore();
  http.respond(1, page(items(40, 40), { nextCursor: 'image-79' }));
  await load;
  expect(http.requests[0].init.signal?.aborted).toBe(true);
  json.resolve(refreshed(initial, []));
  await checking;
  expect(value.getSnapshot().page?.items).toHaveLength(80);
});

it('a failed append retains the page; an invalid cursor requires reload and successful reload increases the thumbnail revision', async () => {
  const http = transport();
  const initial = page();
  const value = session(initial, http.fetcher);
  const failed = value.loadMore();
  http.respond(0, { message: 'internal failure' }, 500);
  await failed;
  expect(value.getSnapshot().page).toBe(initial);
  expect(value.getSnapshot().loadError).not.toBe('');
  const invalid = value.loadMore();
  http.respond(1, { code: 'SHARING_CURSOR_INVALID' }, 409);
  await invalid;
  expect(value.getSnapshot()).toMatchObject({
    page: initial,
    cursorInvalid: true,
    loading: false,
  });
  await value.loadMore();
  expect(http.requests).toHaveLength(2);
  const retry = value.reload();
  expect(http.requests[2].url).toBe('/s/capability-token/items');
  const fresh = page(items(2), { hasMore: false, nextCursor: null });
  http.respond(2, fresh);
  await retry;
  expect(value.getSnapshot()).toMatchObject({
    page: fresh,
    cursorInvalid: false,
    loadError: '',
    refreshError: '',
    revision: 1,
    revoked: false,
  });
});

it('network or HTTP refresh failure retains current content and can be retried successfully', async () => {
  const http = transport();
  const initial = page();
  const value = session(initial, http.fetcher);
  const network = value.refresh();
  http.requests[0].result.reject(new TypeError('network offline'));
  await network;
  expect(value.getSnapshot()).toMatchObject({
    page: initial,
    refreshing: false,
  });
  expect(value.getSnapshot().refreshError).not.toBe('');
  const failed = value.refresh();
  http.respond(1, {}, 500);
  await failed;
  expect(value.getSnapshot().page).toBe(initial);
  expect(value.getSnapshot().refreshError).not.toBe('');
  const error = value.getSnapshot().refreshError;
  const retry = value.refresh();
  expect(value.getSnapshot()).toMatchObject({
    refreshing: true,
    refreshError: error,
  });
  expect(value.getSnapshot().page?.items).toHaveLength(40);
  http.respond(2, refreshed(initial));
  await retry;
  expect(value.getSnapshot()).toMatchObject({
    refreshError: '',
    refreshing: false,
    page: initial,
  });
});

it('a partial successful refresh does not hide the previous error while another batch is pending or fails', async () => {
  const http = transport();
  const initial = page(items(120));
  const value = session(initial, http.fetcher);
  const failed = value.refresh();
  http.respond(0, {}, 500);
  await failed;
  const error = value.getSnapshot().refreshError;

  const retry = value.refresh();
  http.respond(1, refreshed(initial, initial.items.slice(0, 80)));
  await flush();
  expect(http.requests).toHaveLength(3);
  expect(value.getSnapshot()).toMatchObject({
    refreshing: true,
    refreshError: error,
  });
  http.respond(2, {}, 503);
  await retry;
  expect(value.getSnapshot().refreshError).not.toBe('');
  expect(value.getSnapshot().page?.items).toHaveLength(120);

  const successful = value.refresh();
  http.respond(3, refreshed(initial, initial.items.slice(0, 80)));
  await flush();
  expect(value.getSnapshot().refreshError).not.toBe('');
  http.respond(4, refreshed(initial, initial.items.slice(80)));
  await successful;
  expect(value.getSnapshot()).toMatchObject({
    refreshing: false,
    refreshError: '',
  });
});

it('a policy change that ends a partial refresh retains its error until the next complete cycle succeeds', async () => {
  const http = transport();
  const initial = page(items(120));
  const value = session(initial, http.fetcher);
  const failed = value.refresh();
  http.respond(0, {}, 500);
  await failed;
  const error = value.getSnapshot().refreshError;
  const updated = page(initial.items, { layout: 'masonry' });

  const partial = value.refresh();
  http.respond(1, refreshed(updated, initial.items.slice(0, 80)));
  await partial;
  expect(http.requests).toHaveLength(2);
  expect(value.getSnapshot()).toMatchObject({
    refreshing: false,
    refreshError: error,
    page: { layout: 'masonry' },
  });

  const complete = value.refresh();
  http.respond(2, refreshed(updated, initial.items.slice(0, 80)));
  await flush();
  expect(value.getSnapshot().refreshError).toBe(error);
  http.respond(3, refreshed(updated, initial.items.slice(80)));
  await complete;
  expect(value.getSnapshot()).toMatchObject({
    refreshing: false,
    refreshError: '',
  });
});

it('visibility pauses and aborts status checks; resume checks immediately and polls every five seconds without overlap', async () => {
  const http = transport();
  const initial = page();
  const value = session(initial, http.fetcher);
  value.setVisible(true);
  expect(http.requests).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(15000);
  expect(http.requests).toHaveLength(1);
  value.setVisible(false);
  expect(http.requests[0].init.signal?.aborted).toBe(true);
  expect(value.getSnapshot().refreshing).toBe(false);
  await vi.advanceTimersByTimeAsync(15000);
  expect(http.requests).toHaveLength(1);
  value.setVisible(true);
  expect(http.requests).toHaveLength(2);
  http.respond(0, refreshed(initial, []));
  await flush();
  expect(value.getSnapshot()).toMatchObject({
    refreshing: true,
    page: initial,
  });
  http.respond(1, refreshed(initial));
  await flush();
  await vi.advanceTimersByTimeAsync(4999);
  expect(http.requests).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(http.requests).toHaveLength(3);
  http.respond(2, refreshed(initial));
  await flush();
});

it('stop cancels load and refresh; remount can restart without old finally clearing the new operation', async () => {
  const http = transport();
  const initial = page();
  const value = session(initial, http.fetcher);
  const oldLoad = value.loadMore();
  value.setVisible(true);
  value.stop();
  expect(http.requests.every((request) => request.init.signal?.aborted)).toBe(
    true,
  );
  expect(value.getSnapshot()).toMatchObject({
    loading: false,
    refreshing: false,
  });
  await vi.advanceTimersByTimeAsync(10000);
  expect(http.requests).toHaveLength(2);
  value.setVisible(true);
  const newLoad = value.loadMore();
  expect(http.requests).toHaveLength(4);
  http.respond(0, page(items(40, 40)));
  http.respond(1, refreshed(initial, []));
  await oldLoad;
  await flush();
  expect(value.getSnapshot()).toMatchObject({
    loading: true,
    refreshing: true,
    page: initial,
  });
  await value.loadMore();
  await value.refresh();
  expect(http.requests).toHaveLength(4);
  http.respond(2, refreshed(initial));
  await flush();
  http.respond(3, page(items(40, 40)));
  await newLoad;
  expect(value.getSnapshot().page?.items).toHaveLength(80);
});

it('an internal subscription fault propagates instead of being reported as a network failure', async () => {
  const http = transport();
  const value = session(page(), http.fetcher);
  const unsubscribe = value.subscribe(() => {
    throw new Error('subscriber programming defect');
  });
  await expect(value.loadMore()).rejects.toThrow(
    'subscriber programming defect',
  );
  expect(value.getSnapshot().loadError).toBe('');
  unsubscribe();
});

it('a successful response with a broken internal data contract is not silently treated as cancellation', async () => {
  const http = transport();
  const value = session(page(), http.fetcher);
  const pending = value.loadMore();
  http.requests[0].result.resolve(Response.json(null));
  await expect(pending).rejects.toThrow(TypeError);
  expect(value.getSnapshot().loadError).toBe('');
});

it('an internal subscriber fault during revocation propagates even though revocation aborts the request', async () => {
  const http = transport();
  const value = session(page(), http.fetcher);
  const pending = value.refresh();
  const unsubscribe = value.subscribe(() => {
    throw new Error('revocation subscriber defect');
  });
  http.respond(0, {}, 401);
  try {
    await expect(pending).rejects.toThrow('revocation subscriber defect');
  } finally {
    unsubscribe();
  }
});

it('an initial password gate exposes no data and can establish a fresh page after successful unlocking', async () => {
  const http = transport();
  const value = new ShareSession(
    'capability-token',
    { status: 401, page: null },
    http.fetcher,
  );
  sessions.push(value);
  value.setVisible(true);
  await value.loadMore();
  await value.refresh();
  expect(http.requests).toHaveLength(0);
  expect(value.getSnapshot()).toMatchObject({
    page: null,
    status: 401,
    revoked: false,
  });
  const pending = value.reload();
  const initial = page();
  http.respond(0, initial);
  await pending;
  expect(value.getSnapshot()).toMatchObject({
    page: initial,
    status: 200,
    revoked: false,
    revision: 1,
  });
});

it('a successful append retains an unrelated status-check failure until status checking is retried', async () => {
  const http = transport();
  const value = session(page(), http.fetcher);
  const checking = value.refresh();
  http.respond(0, {}, 500);
  await checking;
  const statusError = value.getSnapshot().refreshError;
  const loading = value.loadMore();
  http.respond(1, page(items(40, 40)));
  await loading;
  expect(value.getSnapshot().page?.items).toHaveLength(80);
  expect(value.getSnapshot().refreshError).toBe(statusError);
});

it('a failed read after unlocking shows a retryable fault instead of the old password gate, while an existing page survives a failed reload', async () => {
  const http = transport();
  const value = new ShareSession(
    'capability-token',
    { status: 401, page: null },
    http.fetcher,
  );
  sessions.push(value);
  value.setVisible(true);
  const failed = value.reload();
  http.respond(0, {}, 503);
  await failed;
  expect(value.getSnapshot()).toMatchObject({
    status: 500,
    page: null,
    loading: false,
    revision: 0,
  });
  expect(value.getSnapshot().loadError).not.toBe('');

  const retry = value.reload();
  const initial = page();
  http.respond(1, initial);
  await retry;
  expect(value.getSnapshot()).toMatchObject({
    status: 200,
    page: initial,
    loadError: '',
    revision: 1,
    revoked: false,
  });

  const loadedPage = value.getSnapshot().page;
  const laterFailure = value.reload();
  http.respond(2, {}, 503);
  await laterFailure;
  expect(value.getSnapshot()).toMatchObject({ status: 200, revision: 1 });
  expect(value.getSnapshot().page).toBe(loadedPage);
  expect(value.getSnapshot().loadError).not.toBe('');
});
