import { CollectionError } from '../../../server/collections/errors.ts';
import {
  collectionErrorStatus,
  collectionResponse,
} from '../../../server/collections/http.ts';
import type {
  createTag,
  listTags,
  readTag,
  renameTag,
} from '../../../server/collections/tag-management.ts';
import { createRuntimeLogger } from '../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../server/startup/server-start.ts';

type TagResult =
  | ReturnType<typeof listTags>
  | ReturnType<typeof createTag>
  | ReturnType<typeof renameTag>
  | { tag: ReturnType<typeof readTag> }
  | { deleted: boolean };

/** Domain outcome logs extend the shared collections HTTP boundary. */
export function tagResponse(
  request: Request,
  operation: () => Promise<TagResult> | TagResult,
  status = 200,
) {
  const context = {
    method: request.method,
    path: new URL(request.url).pathname,
  };
  return collectionResponse(
    request,
    'tags',
    async () => {
      try {
        const result = await operation();
        createRuntimeLogger(
          'collections.tags',
          getServerRuntime().config.logLevel,
        ).info(
          {
            ...context,
            tagId: 'tag' in result ? result.tag.id : undefined,
            reused: 'reused' in result ? result.reused : undefined,
            changed: 'changed' in result ? result.changed : undefined,
            deleted: 'deleted' in result ? result.deleted : undefined,
            status,
          },
          'Tag management succeeded',
        );
        return result;
      } catch (err) {
        if (err instanceof CollectionError)
          createRuntimeLogger(
            'collections.tags',
            getServerRuntime().config.logLevel,
          ).info(
            {
              ...context,
              code: err.code,
              message: err.message,
              status: collectionErrorStatus(err),
            },
            'Tag management rejected',
          );
        throw err;
      }
    },
    status,
  );
}
