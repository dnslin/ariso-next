import { afterEach, expect, it, vi } from 'vitest';
import {
  accountRequest,
  AccountRequestError,
  readAccountEmail,
} from '../../../src/components/identity/account-request';

afterEach(() => vi.unstubAllGlobals());

it('reads the current email without treating an absent account as an empty owner', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json({ email: 'current@example.test' }),
  );
  await expect(readAccountEmail()).resolves.toBe('current@example.test');
});

it.each([null, {}, { email: 42 }])(
  'rejects unreadable current account data: %j',
  async (body) => {
    vi.stubGlobal('fetch', async () => Response.json(body));
    await expect(readAccountEmail()).rejects.toThrow('账号响应缺少登录邮箱');
  },
);

it('keeps HTTP errors and field messages available to the form', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json(
      {
        code: 'INVALID_PASSWORD',
        message: '当前密码不正确',
        fields: [{ field: 'currentPassword', message: '当前密码不正确' }],
      },
      { status: 400 },
    ),
  );
  await expect(accountRequest('/api/account/password')).rejects.toMatchObject({
    status: 400,
    code: 'INVALID_PASSWORD',
    fields: [{ field: 'currentPassword', message: '当前密码不正确' }],
  });
});

it('does not turn an unreadable successful response into a success result', async () => {
  vi.stubGlobal(
    'fetch',
    async () => new Response('truncated', { status: 200 }),
  );
  await expect(accountRequest('/api/account/email')).rejects.toThrow(
    '无法读取账号修改结果（HTTP 200）',
  );
});

it('preserves failed HTTP status even when the error response is not JSON', async () => {
  vi.stubGlobal(
    'fetch',
    async () => new Response('gateway error', { status: 502 }),
  );
  await expect(accountRequest('/api/account/email')).rejects.toBeInstanceOf(
    AccountRequestError,
  );
  await expect(accountRequest('/api/account/email')).rejects.toMatchObject({
    status: 502,
  });
});

it.each([null, [], { message: 42, fields: 'not a field list' }])(
  'keeps HTTP context when the failed JSON response has an unexpected shape: %j',
  async (body) => {
    vi.stubGlobal('fetch', async () => Response.json(body, { status: 502 }));
    await expect(accountRequest('/api/account/email')).rejects.toMatchObject({
      status: 502,
      message: '账号请求失败（HTTP 502）',
      fields: [],
    });
  },
);

it('propagates a disconnected request without reporting that no write happened', async () => {
  const disconnected = new TypeError('connection closed');
  vi.stubGlobal('fetch', async () => {
    throw disconnected;
  });
  await expect(accountRequest('/api/account/email')).rejects.toBe(disconnected);
});
