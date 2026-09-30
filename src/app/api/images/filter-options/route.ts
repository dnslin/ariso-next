import { readLibraryFilterOptions } from '../../../../server/library/filter-options.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';
import { respondToLibraryQuery } from '../query-response.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return respondToLibraryQuery(request, () =>
    readLibraryFilterOptions(
      getServerRuntime().connection.db,
      new URL(request.url).searchParams,
    ),
  );
}
