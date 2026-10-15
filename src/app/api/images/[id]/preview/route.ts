import { resolve } from 'node:path';
import { previewResponse } from '../../../../../server/media/preview-http.ts';
import { prepareTiffPreview } from '../../../../../server/media/tiff-preview.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';
import { createRuntimeLogger } from '../../../../../server/runtime/logger.ts';
import { createSecretCrypto } from '../../../../../server/runtime/crypto.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return previewResponse(request, async () => {
    const { id } = await context.params;
    const server = getServerRuntime();
    return prepareTiffPreview(
      request,
      id,
      {
        db: server.connection.db,
        storageRoot: resolve(server.config.dataDir, 'storage'),
        temporaryRoot: resolve(server.config.dataDir, 'tmp'),
        resources: server.mediaResources,
        logger: createRuntimeLogger(
          'media.tiff-preview',
          server.config.logLevel,
        ),
        secretCrypto: createSecretCrypto(server.config.encryptionKey),
      },
      server.mediaQueue.previews,
    );
  });
}
