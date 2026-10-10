import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetRequest } from '../../../src/components/identity/reset-request';

afterEach(() => vi.unstubAllGlobals());

describe('密码恢复请求结果', () => {
  it('只接受明确成功，不把2xx非JSON或缺失status当作成功', async () => {
    for (const response of [
      new Response('proxy'),
      Response.json({}),
      Response.json(null),
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      expect(
        await resetRequest('reset-password', {
          token: 'test',
          newPassword: 'password',
        }),
      ).toMatchObject({ ok: false, code: 'RESULT_UNKNOWN', status: 200 });
    }
  });
  it('丢失响应只报告未知且不自动重试', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('network lost'));
    vi.stubGlobal('fetch', fetch);
    expect(
      await resetRequest('request-password-reset', {
        email: 'owner@example.test',
      }),
    ).toEqual({ ok: false, code: 'RESULT_UNKNOWN', status: 0, retryAt: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('保留邮件错误和服务器允许重试时间', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { code: 'RESET_EMAIL_DELIVERY_UNKNOWN' },
            { status: 502 },
          ),
        ),
    );
    expect(
      await resetRequest('request-password-reset', {
        email: 'owner@example.test',
      }),
    ).toMatchObject({
      ok: false,
      code: 'RESET_EMAIL_DELIVERY_UNKNOWN',
      status: 502,
    });
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { code: 'RATE_LIMITED' },
            { status: 429, headers: { 'x-retry-after': '17' } },
          ),
        ),
    );
    expect(
      await resetRequest('request-password-reset', {
        email: 'owner@example.test',
      }),
    ).toMatchObject({ ok: false, retryAt: 18000 });
    vi.restoreAllMocks();
  });
  it('发送原样密码并禁止把当前凭据URL带入Referer', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: true }));
    vi.stubGlobal('fetch', fetch);
    const body = { token: 'test', newPassword: '  keep spaces  ' };
    expect(await resetRequest('reset-password', body)).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/reset-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body),
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      }),
    );
  });
});
