import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireOwner } from './owner.ts';

/** 服务端页面入口：仅未授权转登录，其余错误交给页面错误边界。 */
export async function requirePageOwner(returnTo: string) {
  const requestHeaders = await headers();
  try {
    return await requireOwner(
      new Request(new URL(returnTo, 'http://ariso.internal'), {
        headers: requestHeaders,
      }),
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'UNAUTHORIZED'
    )
      throw error;
    const hadCookie = /(?:^|;\s*)(?:__Secure-)?ariso\.session_token=/.test(
      requestHeaders.get('cookie') ?? '',
    );
    redirect(
      `/login?returnTo=${encodeURIComponent(returnTo)}${hadCookie ? '&reason=expired' : ''}`,
    );
  }
}
