import { getAuth } from './auth.ts';

/** 每次读取真实 Cookie 会话；管理写入还必须来自当前保存的站点 origin。 */
export async function requireOwner(request: Request) {
  const auth = getAuth();
  const session =
    auth &&
    (await auth.api.getSession({
      headers: request.headers,
      // 这里只鉴权，不能丢弃续期产生的 Set-Cookie；续期由会话 HTTP 入口完成。
      query: { disableRefresh: true },
    }));
  if (!session) {
    throw Object.assign(new Error('请先登录'), {
      status: 401,
      code: 'UNAUTHORIZED',
    });
  }
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
    request.headers.get('origin') !== auth.options.baseURL
  ) {
    throw Object.assign(new Error('请求来源与当前站点地址不符'), {
      status: 403,
      code: 'INVALID_ORIGIN',
    });
  }
  return session.user;
}
