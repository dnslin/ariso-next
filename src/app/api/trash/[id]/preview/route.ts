import { resolve } from 'node:path';
import { readOptionalOwner } from '../../../../../server/identity/owner.ts';
import {
  imageFailure,
  prepareImageDelivery,
} from '../../../../../server/delivery/response.ts';
import { parseImageRequest } from '../../../../../server/delivery/links.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';
import { createRuntimeLogger } from '../../../../../server/runtime/logger.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const query = new URL(request.url).searchParams;
    const { selectedVersion, download } = parseImageRequest(id, query);
    if (
      !selectedVersion ||
      download ||
      [...query.keys()].some((key) => key !== 'type')
    )
      return imageFailure(request, 'INVALID_IMAGE_REQUEST');
    const server = getServerRuntime();
    return await prepareImageDelivery(request, id, {
      access: 'trash-preview',
      db: server.connection.db,
      storageRoot: resolve(server.config.dataDir, 'storage'),
      readOwner: async () => !!(await readOptionalOwner(request)),
      logger: createRuntimeLogger(
        'delivery.trash-preview',
        server.config.logLevel,
      ),
    });
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      err.code === 'INVALID_IMAGE_REQUEST'
    )
      return imageFailure(request, 'INVALID_IMAGE_REQUEST');
    createRuntimeLogger('delivery.trash-preview', 'error').error(
      { err },
      'Trash preview failed',
    );
    return imageFailure(request, 'DELIVERY_FAILED');
  }
}

export { handle as GET, handle as HEAD };
