import { afterEach, expect, it, vi } from 'vitest';
import {
  createToken,
  newTokenCandidates,
  readTokens,
  revokeToken,
  setTokenEnabled,
  TokenRequestError,
  type TokenRecord,
} from '../../../src/components/identity/token-request';

const token: TokenRecord = {
  id: 'token-one',
  name: '部署脚本',
  enabled: true,
  createdAt: '2026-10-06T00:00:00.000Z',
  expiresAt: null,
};
afterEach(() => vi.unstubAllGlobals());

it('reads only the record DTO and does not retain raw keys in the list', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json({
      tokens: [
        { ...token, key: 'never-cache-this', hash: 'hash', start: 'partial' },
      ],
    }),
  );
  await expect(readTokens()).resolves.toEqual([token]);
});

it.each([
  null,
  {},
  { tokens: null },
  { tokens: [{ ...token, enabled: 'true' }] },
])('does not turn a malformed list into empty data: %j', async (body) => {
  vi.stubGlobal('fetch', async () => Response.json(body));
  await expect(readTokens()).rejects.toThrow();
});

it('preserves a nullable plugin name without fabricating a name', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json({ tokens: [{ ...token, name: null }] }),
  );
  await expect(readTokens()).resolves.toEqual([{ ...token, name: null }]);
});

it('returns a created key once and sends only the supported inputs', async () => {
  const fetch = vi.fn(async () => Response.json({ token, key: 'new-secret' }));
  vi.stubGlobal('fetch', fetch);
  await expect(createToken({ name: '部署脚本' })).resolves.toEqual({
    token,
    key: 'new-secret',
  });
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]).toEqual([
    '/api/upload-tokens',
    {
      cache: 'no-store',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '部署脚本' }),
    },
  ]);
});

it('does not retry disconnected or unreadable create responses', async () => {
  const fetch = vi.fn(async () => new Response('truncated', { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  await expect(createToken({ name: 'script', expiresIn: 10 })).rejects.toThrow(
    '无法读取 Token 操作结果',
  );
  expect(fetch).toHaveBeenCalledOnce();
});

it('keeps status, code and field errors for the form', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json(
      {
        code: 'INVALID_INPUT',
        message: '参数无效',
        fields: [{ field: 'expiresIn', message: '到期时间须晚于当前时间' }],
      },
      { status: 400 },
    ),
  );
  await expect(createToken({ name: 'script' })).rejects.toMatchObject({
    status: 400,
    code: 'INVALID_INPUT',
    fields: [{ field: 'expiresIn', message: '到期时间须晚于当前时间' }],
  });
});

it('retains a failed HTTP status when a gateway returns non-JSON data', async () => {
  vi.stubGlobal(
    'fetch',
    async () => new Response('gateway unavailable', { status: 502 }),
  );
  await expect(readTokens()).rejects.toBeInstanceOf(TokenRequestError);
  await expect(readTokens()).rejects.toMatchObject({ status: 502 });
});

it('updates and revokes the actual record ID', async () => {
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) =>
    Response.json(
      init?.method === 'PATCH'
        ? { token: { ...token, enabled: false } }
        : { success: true },
    ),
  );
  vi.stubGlobal('fetch', fetch);
  await expect(setTokenEnabled('id/with slash', false)).resolves.toEqual({
    ...token,
    enabled: false,
  });
  await revokeToken('id/with slash');
  expect(fetch.mock.calls[0]).toEqual([
    '/api/upload-tokens/id%2Fwith%20slash',
    {
      cache: 'no-store',
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{"enabled":false}',
    },
  ]);
  expect(fetch.mock.calls[1]).toEqual([
    '/api/upload-tokens/id%2Fwith%20slash',
    { cache: 'no-store', method: 'DELETE' },
  ]);
});

it('recognizes only new IDs and retains ambiguity among concurrent same-name records', () => {
  const sameName = [
    { ...token, id: 'new-a' },
    { ...token, id: 'new-b' },
  ];
  expect(newTokenCandidates([token.id], [token, ...sameName])).toEqual(
    sameName,
  );
  expect(newTokenCandidates([token.id], [token])).toEqual([]);
});
