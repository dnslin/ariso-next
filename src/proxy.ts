import { NextResponse, type NextRequest } from 'next/server';
import {
  LibraryQueryError,
  parseLibraryQuery,
} from './server/library/query-schema.ts';

/** Validate before Next normalizes away unknown query keys (e.g. __proto__, nxtP*). */
export function proxy(request: NextRequest) {
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
  matcher: ['/api/images', '/api/images/:id/neighbors'],
};
