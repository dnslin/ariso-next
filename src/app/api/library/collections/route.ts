import {
  listSmartCollections,
  createSmartCollection,
} from '../../../../server/library/smart-collections.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';
import { respondToLibraryQuery } from '../../images/query-response.ts';
import { readSmartCollectionBody } from './response.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return respondToLibraryQuery(request, () => ({
    items: listSmartCollections(getServerRuntime().connection.db),
  }));
}
export function POST(request: Request) {
  return respondToLibraryQuery(
    request,
    async () => ({
      collection: createSmartCollection(
        getServerRuntime().connection.db,
        await readSmartCollectionBody(request),
      ),
    }),
    'library/collections:POST',
    201,
  );
}
