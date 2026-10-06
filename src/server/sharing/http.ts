import { NextRequest, NextResponse } from 'next/server.js';
import { requireOwner } from '../identity/owner.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { requireSiteSettings } from '../site/settings.ts';
import { getServerRuntime } from '../startup/server-start.ts';
import { shareGrantCookie } from './authorization.ts';
import { SharingError } from './errors.ts';
import { readPublicShareItems, refreshPublicShare } from './public-query.ts';
import { unlockInputSchema } from './validation.ts';

export const shareResponseHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
};

export async function shareBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new SharingError(
      'SHARING_INVALID_INPUT',
      '请求内容必须是有效的 JSON',
    );
  }
}

function shareErrorResponse(err: unknown, request: Request) {
  // Startup and Route Handler bundles can contain distinct class constructors.
  // Use the same explicit internal error fields as storage/identity HTTP boundaries.
  if (
    err instanceof Error &&
    'status' in err &&
    typeof err.status === 'number' &&
    'code' in err &&
    typeof err.code === 'string' &&
    (err.code.startsWith('SHARING_') ||
      err.code === 'UNAUTHORIZED' ||
      err.code === 'INVALID_ORIGIN')
  )
    return NextResponse.json(
      { code: err.code, message: err.message },
      {
        status: err.status,
        headers: {
          ...shareResponseHeaders,
          ...(err.code === 'SHARING_RATE_LIMITED' && 'retryAfter' in err
            ? { 'Retry-After': String(err.retryAfter) }
            : {}),
        },
      },
    );
  createRuntimeLogger('sharing.http', getServerRuntime().config.logLevel).error(
    { err, method: request.method, path: new URL(request.url).pathname },
    'Sharing request failed',
  );
  return NextResponse.json(
    { code: 'INTERNAL_SERVER_ERROR', message: '分享操作失败，请重试' },
    { status: 500, headers: shareResponseHeaders },
  );
}

/** Owner authentication runs before parsing or any management operation. */
export async function ownerShareResponse(
  request: Request,
  operation: () => unknown | Promise<unknown>,
) {
  try {
    await requireOwner(request);
    return NextResponse.json(await operation(), {
      headers: shareResponseHeaders,
    });
  } catch (err) {
    return shareErrorResponse(err, request);
  }
}

export async function unlockShareResponse(request: NextRequest, token: string) {
  try {
    const runtime = getServerRuntime();
    const site = requireSiteSettings(runtime.connection.db);
    if (request.headers.get('origin') !== site.publicUrl)
      throw new SharingError(
        'INVALID_ORIGIN',
        '请求来源与当前站点地址不符',
        403,
      );
    const input = unlockInputSchema.safeParse(await shareBody(request));
    if (!input.success)
      throw new SharingError(
        'SHARING_INVALID_INPUT',
        '分享密码须包含 1–128 个 Unicode 码点',
      );
    const result = await runtime.sharing.unlock(token, input.data.password);
    const response = NextResponse.json(
      { unlocked: true },
      { headers: shareResponseHeaders },
    );
    if ('grantSecret' in result)
      response.cookies.set(shareGrantCookie, result.grantSecret, {
        httpOnly: true,
        sameSite: 'lax',
        secure: site.publicUrl.startsWith('https:'),
        path: `/s/${token}`,
        maxAge: 86400,
        expires: result.expiresAt,
      });
    return response;
  } catch (err) {
    return shareErrorResponse(err, request);
  }
}

/** Deliberately ignores owner sessions; only this share's path-scoped grant is read. */
export function publicShareItemsResponse(request: NextRequest, token: string) {
  try {
    const runtime = getServerRuntime();
    return NextResponse.json(
      readPublicShareItems(
        runtime.connection.db,
        { token, grantSecret: request.cookies.get(shareGrantCookie)?.value },
        request.nextUrl.searchParams,
      ),
      { headers: shareResponseHeaders },
    );
  } catch (err) {
    return shareErrorResponse(err, request);
  }
}

export async function publicShareRefreshResponse(
  request: NextRequest,
  token: string,
) {
  try {
    const runtime = getServerRuntime();
    if (
      request.headers.get('origin') !==
      requireSiteSettings(runtime.connection.db).publicUrl
    )
      throw new SharingError(
        'INVALID_ORIGIN',
        '请求来源与当前站点地址不符',
        403,
      );
    return NextResponse.json(
      refreshPublicShare(
        runtime.connection.db,
        { token, grantSecret: request.cookies.get(shareGrantCookie)?.value },
        await shareBody(request),
      ),
      { headers: shareResponseHeaders },
    );
  } catch (err) {
    return shareErrorResponse(err, request);
  }
}
