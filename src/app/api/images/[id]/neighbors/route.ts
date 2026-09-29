import { readLibraryNeighbors } from '../../../../../server/library/queries.ts';
import { parseLibraryQuery } from '../../../../../server/library/query-schema.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';
import { respondToLibraryQuery } from '../../query-response.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return respondToLibraryQuery(request, async () =>
    readLibraryNeighbors(
      getServerRuntime().connection.db,
      (await context.params).id,
      parseLibraryQuery(new URL(request.url).searchParams),
    ),
  );
}
