import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ImageShareSession } from '../../../src/components/sharing/image-share-session';
import type { OwnerImageShareSettings } from '../../../src/server/sharing/image-configuration';

const request = vi.fn();
const expire = vi.fn();
const unshared: OwnerImageShareSettings = {
  share: null,
  sourceVersion: 'original',
  unavailableReason: null,
  timeZone: 'Asia/Shanghai',
};
const active: OwnerImageShareSettings = {
  ...unshared,
  share: {
    imageId: 'image',
    sourceVersion: 'original',
    token: 'new-token',
    url: 'https://example.test/s/image/new-token',
    expiresAt: '2026-10-22T02:00:00Z',
    createdAt: '2026-10-21T02:00:00Z',
    revokedAt: null,
    state: 'active',
  },
};
let session: ImageShareSession;
beforeEach(() => {
  request.mockReset();
  expire.mockReset();
  vi.stubGlobal('fetch', request);
  session = new ImageShareSession('image', expire);
});
afterEach(() => {
  session.stop();
  vi.unstubAllGlobals();
});

it('opening reads state without creating, and only an explicit action submits the disclosed role', async () => {
  request.mockResolvedValueOnce(Response.json(unshared));
  await session.read();
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][1].method).toBeUndefined();
  request.mockResolvedValueOnce(Response.json({ share: active.share }));
  await session.create(24);
  expect(request.mock.calls[1][1].method).toBe('POST');
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({
    hours: 24,
    sourceVersion: 'original',
  });
  expect(session.getSnapshot().settings?.share?.token).toBe('new-token');
});
it('reconciles an unknown creation by reading, without posting twice', async () => {
  request.mockResolvedValueOnce(Response.json(unshared));
  await session.read();
  request
    .mockRejectedValueOnce(new TypeError('connection lost'))
    .mockResolvedValueOnce(Response.json(active));
  await session.create(1);
  expect(request.mock.calls.map((call) => call[1].method ?? 'GET')).toEqual([
    'GET',
    'POST',
    'GET',
  ]);
  expect(session.getSnapshot()).toMatchObject({
    unknown: false,
    settings: active,
  });
});
it('keeps mutations blocked while a read cannot establish the outcome', async () => {
  request.mockResolvedValueOnce(Response.json(unshared));
  await session.read();
  request
    .mockRejectedValueOnce(new TypeError('lost'))
    .mockResolvedValueOnce(Response.json(unshared));
  await session.create(24);
  expect(session.getSnapshot().unknown).toBe(true);
  await session.create(24);
  expect(request).toHaveBeenCalledTimes(3);
  request.mockResolvedValueOnce(Response.json(active));
  await session.read();
  expect(session.getSnapshot().unknown).toBe(false);
});
it('clears private state and expires the owner session on 401', async () => {
  request.mockResolvedValueOnce(Response.json(active));
  await session.read();
  request.mockResolvedValueOnce(
    Response.json({ message: '请先登录' }, { status: 401 }),
  );
  await session.revoke();
  expect(session.getSnapshot().settings).toBeNull();
  expect(expire).toHaveBeenCalledOnce();
});
it('does not apply a late read after the dialog is closed', async () => {
  let resolve!: (response: Response) => void;
  request.mockReturnValueOnce(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  const read = session.read();
  session.stop();
  resolve(Response.json(active));
  await read;
  expect(session.getSnapshot().settings).toBeNull();
});

it('can restart after an effect cleanup without an aborted read clearing the new request', async () => {
  let resolve!: (response: Response) => void;
  request
    .mockReturnValueOnce(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    )
    .mockResolvedValueOnce(Response.json(active));
  const first = session.read();
  session.stop();
  await session.start();
  resolve(Response.json(unshared));
  await first;
  expect(session.getSnapshot()).toMatchObject({
    settings: active,
    pending: null,
  });
});
