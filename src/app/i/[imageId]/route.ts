import { resolve } from 'node:path';
import { readOptionalOwner } from '../../../server/identity/owner.ts';
import {
  deliveryHeaders,
  imageFailure,
  prepareImageDelivery,
} from '../../../server/delivery/response.ts';
import { getServerRuntime } from '../../../server/startup/server-start.ts';
import { createRuntimeLogger } from '../../../server/runtime/logger.ts';
import { getAccessCollector } from '../../../server/analytics/collector.ts';
import { requireSiteSettings } from '../../../server/site/settings.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(
  request: Request,
  context: { params: Promise<{ imageId: string }> },
) {
  try {
    const { imageId } = await context.params;
    const server = getServerRuntime();
    const analyticsLogger = createRuntimeLogger(
      'analytics',
      server.config.logLevel,
    );
    let recorded = false;
    return await prepareImageDelivery(request, imageId, {
      db: server.connection.db,
      storageRoot: resolve(server.config.dataDir, 'storage'),
      readOwner: async () => !!(await readOptionalOwner(request)),
      logger: createRuntimeLogger('delivery', server.config.logLevel),
      onAccess(event) {
        if (recorded) return;
        recorded = true;
        let timezone: string | undefined;
        try {
          // Read committed settings at first-byte delivery, not before awaiting I/O.
          timezone = requireSiteSettings(server.connection.db).timeZone;
          if (!getAccessCollector().recordAccess(event, timezone)) {
            analyticsLogger.error(
              { ...event, timezone },
              'Access buffer full; event dropped and statistics incomplete',
            );
          }
        } catch (err) {
          analyticsLogger.error(
            { err, ...event, timezone },
            'Access aggregation failed',
          );
        }
      },
    });
  } catch (err) {
    createRuntimeLogger('delivery', 'error').error(
      { err },
      'Image route failed',
    );
    return imageFailure(request, 'DELIVERY_FAILED');
  }
}

function unsupported() {
  return Response.json(
    { code: 'METHOD_NOT_ALLOWED', message: '仅支持 GET 和 HEAD' },
    {
      status: 405,
      headers: { ...deliveryHeaders, Allow: 'GET, HEAD, OPTIONS' },
    },
  );
}
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...deliveryHeaders, Allow: 'GET, HEAD, OPTIONS' },
  });
}
export {
  handle as GET,
  handle as HEAD,
  unsupported as POST,
  unsupported as PUT,
  unsupported as PATCH,
  unsupported as DELETE,
};
