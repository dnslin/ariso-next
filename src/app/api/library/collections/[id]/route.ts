import {
  readSmartCollection,
  updateSmartCollection,
  deleteSmartCollection,
} from '../../../../../server/library/smart-collections.ts';
import { resolveSmartRules } from '../../../../../server/library/smart-rules.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';
import { respondToLibraryQuery } from '../../../images/query-response.ts';
import { readSmartCollectionBody } from '../response.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return respondToLibraryQuery(request, async () => {
    const { id } = await context.params;
    const collection = readSmartCollection(
      getServerRuntime().connection.db,
      id,
    );
    return { collection, query: resolveSmartRules(collection.rules) };
  });
}
export function PATCH(request: Request, context: Context) {
  return respondToLibraryQuery(
    request,
    async () => {
      const { id } = await context.params;
      return {
        collection: updateSmartCollection(
          getServerRuntime().connection.db,
          id,
          await readSmartCollectionBody(request),
        ),
      };
    },
    'library/collections/[id]:PATCH',
  );
}
export function DELETE(request: Request, context: Context) {
  return respondToLibraryQuery(
    request,
    async () => {
      const { id } = await context.params;
      return {
        deleted: deleteSmartCollection(getServerRuntime().connection.db, id),
      };
    },
    'library/collections/[id]:DELETE',
  );
}
