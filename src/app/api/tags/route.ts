import { z } from 'zod';
import { CollectionError } from '../../../server/collections/errors.ts';
import {
  collectionBody,
  collectionResponse,
} from '../../../server/collections/http.ts';
import { getOrCreateTags } from '../../../server/collections/records.ts';
import { getServerRuntime } from '../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const inputSchema = z.strictObject({ name: z.string() });

/** Upload quick creation only; management is provided by the collections task. */
export function POST(request: Request) {
  return collectionResponse(
    request,
    'tags',
    async () => {
      const parsed = inputSchema.safeParse(await collectionBody(request));
      if (!parsed.success)
        throw new CollectionError(
          'COLLECTION_INVALID_INPUT',
          parsed.error.message,
        );
      const { db } = getServerRuntime().connection;
      const tag = db.transaction(
        (tx) => getOrCreateTags(tx, [parsed.data.name])[0],
        { behavior: 'immediate' },
      );
      return { tag: { id: tag.id, displayName: tag.displayName } };
    },
    201,
  );
}
