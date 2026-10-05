import { NextResponse, type NextRequest } from 'next/server';
import {
  LibraryQueryError,
  parseLibraryQuery,
} from './server/library/query-schema.ts';
import {
  readShareAccess,
  shareGrantCookie,
} from './server/sharing/authorization.ts';
import { shareResponseHeaders } from './server/sharing/http.ts';
import { getServerRuntime } from './server/startup/server-start.ts';

/** Validate before Next normalizes away unknown query keys (e.g. __proto__, nxtP*). */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/s/')) {
    const token = decodeURIComponent(request.nextUrl.pathname.split('/')[2]);
    const runtime = getServerRuntime();
    const access = runtime.connection.db.transaction((tx) =>
      readShareAccess(tx, {
        token,
        grantSecret: request.cookies.get(shareGrantCookie)?.value,
        now: new Date(),
      }),
    );
    // Continue rendering the public page with the real gate status, including RSC requests.
    // The page repeats access and album reads in its own single snapshot.
    return NextResponse.next({
      status: access.allowed ? 200 : access.status,
      headers: shareResponseHeaders,
    });
  }
  if (request.method === 'GET') {
    try {
      parseLibraryQuery(new URL(request.url).searchParams);
    } catch (error) {
      if (!(error instanceof LibraryQueryError)) throw error;
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/images', '/api/images/:id/neighbors', '/s/:token'],
};
