import { CollectionError } from '../../../server/collections/errors.ts';
import type {
  createTag,
  listTags,
  readTag,
  renameTag,
} from '../../../server/collections/tag-management.ts';
import { requireOwner } from '../../../server/identity/owner.ts';
import { createRuntimeLogger } from '../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../server/startup/server-start.ts';

type TagResult =
  | ReturnType<typeof listTags>
  | ReturnType<typeof createTag>
  | ReturnType<typeof renameTag>
  | { tag: ReturnType<typeof readTag> }
  | { deleted: boolean };

export async function tagResponse(
  request: Request,
  operation: () => Promise<TagResult> | TagResult,
  status = 200,
) {
  const headers = { 'Cache-Control': 'no-store' };
  const context = {
    method: request.method,
    path: new URL(request.url).pathname,
  };
  try {
    await requireOwner(request);
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
    return Response.json(result, { status, headers });
  } catch (err) {
    if (err instanceof CollectionError) {
      const status =
        err.code === 'COLLECTION_TARGET_NOT_FOUND'
          ? 404
          : err.code === 'COLLECTION_TAG_CONFLICT'
            ? 409
            : 400;
      createRuntimeLogger(
        'collections.tags',
        getServerRuntime().config.logLevel,
      ).info(
        { ...context, code: err.code, message: err.message, status },
        'Tag management rejected',
      );
      return Response.json(
        { code: err.code, message: err.message },
        { status, headers },
      );
    }
    if (
      err instanceof Error &&
      'code' in err &&
      'status' in err &&
      ((err.code === 'UNAUTHORIZED' && err.status === 401) ||
        (err.code === 'INVALID_ORIGIN' && err.status === 403))
    )
      return Response.json(
        { code: err.code, message: err.message },
        { status: err.status, headers },
      );
    createRuntimeLogger(
      'collections.tags',
      getServerRuntime().config.logLevel,
    ).error({ err, ...context }, 'Tag management failed');
    return Response.json(
      { code: 'INTERNAL_SERVER_ERROR', message: '标签操作失败，请重试' },
      { status: 500, headers },
    );
  }
}

export async function tagBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new CollectionError(
      'COLLECTION_INVALID_INPUT',
      '请求内容必须是有效的 JSON',
    );
  }
}
