import { readLibraryPage } from '../../../server/library/queries.ts';
import { parseLibraryQuery } from '../../../server/library/query-schema.ts';
import { getServerRuntime } from '../../../server/startup/server-start.ts';
import { respondToLibraryQuery } from './query-response.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return respondToLibraryQuery(request, () =>
    readLibraryPage(
      getServerRuntime().connection.db,
      parseLibraryQuery(new URL(request.url).searchParams),
    ),
  );
}
