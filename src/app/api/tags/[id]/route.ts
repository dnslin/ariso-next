import {
  readTag,
  renameTag,
} from '../../../../server/collections/tag-management.ts';
import { deleteTag } from '../../../../server/collections/records.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';
import { tagBody, tagResponse } from '../response.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, context: Context) {
  return tagResponse(request, async () => {
    const { id } = await context.params;
    return getServerRuntime().connection.db.transaction((tx) => ({
      tag: readTag(tx, id),
    }));
  });
}

export function PATCH(request: Request, context: Context) {
  return tagResponse(request, async () => {
    const { id } = await context.params;
    const input = await tagBody(request);
    return getServerRuntime().connection.db.transaction(
      (tx) => renameTag(tx, id, input),
      { behavior: 'immediate' },
    );
  });
}

export function DELETE(request: Request, context: Context) {
  return tagResponse(request, async () => {
    const { id } = await context.params;
    return getServerRuntime().connection.db.transaction(
      (tx) => ({ deleted: deleteTag(tx, id) }),
      { behavior: 'immediate' },
    );
  });
}
