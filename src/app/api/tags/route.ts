import {
  createTag,
  listTags,
} from '../../../server/collections/tag-management.ts';
import { parseTagQuery } from '../../../server/collections/tag-query.ts';
import { getServerRuntime } from '../../../server/startup/server-start.ts';
import { tagBody, tagResponse } from './response.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return tagResponse(request, () =>
    listTags(
      getServerRuntime().connection.db,
      parseTagQuery(new URL(request.url).searchParams),
    ),
  );
}

export function POST(request: Request) {
  return tagResponse(
    request,
    async () => {
      const input = await tagBody(request);
      return getServerRuntime().connection.db.transaction(
        (tx) => createTag(tx, input),
        { behavior: 'immediate' },
      );
    },
    201,
  );
}
