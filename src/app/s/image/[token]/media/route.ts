import { resolve } from 'node:path';
import { createSecretCrypto } from '../../../../../server/runtime/crypto.ts';
import { createRuntimeLogger } from '../../../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';
import {
  imageShareFailure,
  prepareImageShareDelivery,
} from '../../../../../server/sharing/image-delivery.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const server = getServerRuntime();
    return await prepareImageShareDelivery(
      request,
      (await context.params).token,
      {
        db: server.connection.db,
        storageRoot: resolve(server.config.dataDir, 'storage'),
        temporaryRoot: resolve(server.config.dataDir, 'tmp'),
        secretCrypto: createSecretCrypto(server.config.encryptionKey),
        logger: createRuntimeLogger(
          'sharing.image.delivery',
          server.config.logLevel,
        ),
      },
    );
  } catch (error) {
    createRuntimeLogger('sharing.image.delivery', 'error').error(
      { err: error },
      'Shared image route failed',
    );
    return imageShareFailure(request, error);
  }
}
export { handle as GET, handle as HEAD };
