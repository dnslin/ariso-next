import { z } from 'zod';
import { CollectionError } from '../../../server/collections/errors.ts';
import { getOrCreateTags } from '../../../server/collections/records.ts';
import { requireOwner } from '../../../server/identity/owner.ts';
import { createRuntimeLogger } from '../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const inputSchema = z.strictObject({ name: z.string() });

/** Upload quick creation only; management is provided by the collections task. */
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await requireOwner(request);
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new CollectionError(
        'COLLECTION_INVALID_INPUT',
        parsed.error.message,
      );
    const { db } = getServerRuntime().connection;
    const tag = db.transaction(
      (tx) => getOrCreateTags(tx, [parsed.data.name])[0],
      {
        behavior: 'immediate',
      },
    );
    return Response.json(
      { tag: { id: tag.id, displayName: tag.displayName } },
      { status: 201, headers },
    );
  } catch (error) {
    if (error instanceof CollectionError || error instanceof SyntaxError)
      return Response.json(
        {
          code: 'COLLECTION_INVALID_INPUT',
          message:
            error instanceof CollectionError
              ? error.message
              : '请求内容必须是有效的 JSON',
        },
        { status: 400, headers },
      );
    if (
      error instanceof Error &&
      'status' in error &&
      'code' in error &&
      ((error.code === 'UNAUTHORIZED' && error.status === 401) ||
        (error.code === 'INVALID_ORIGIN' && error.status === 403))
    )
      return Response.json(
        { code: error.code, message: error.message },
        { status: error.status, headers },
      );
    createRuntimeLogger('collections.tags', 'info').error(
      {
        err: error,
        method: request.method,
        path: new URL(request.url).pathname,
      },
      'Tag creation failed',
    );
    return Response.json(
      { code: 'INTERNAL_SERVER_ERROR', message: '标签创建失败，请重试' },
      { status: 500, headers },
    );
  }
}
