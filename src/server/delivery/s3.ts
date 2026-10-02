import type { createSecretCrypto } from '../runtime/crypto.ts';
import { clientConfig } from '../storage/probes.ts';
import { createS3Storage } from '../storage/s3.ts';
import type { selectImageDelivery } from './access.ts';
import { makeHeaders } from './headers.ts';

type Selection = ReturnType<typeof selectImageDelivery>;

/** Signing is local SDK work. Never inspect or proxy the remote object here. */
export async function signImageDelivery(
  selected: Selection,
  method: string,
  download: boolean,
  secretCrypto: ReturnType<typeof createSecretCrypto>,
) {
  const headers = makeHeaders({
    imageId: selected.image.id,
    objectId: selected.object.id,
    size: selected.version.byteSize,
    contentType: selected.version.mime,
    extension: selected.version.format,
    displayName: selected.image.displayName,
    download,
    actualVersion: selected.actualVersion,
  });
  const storage = createS3Storage(
    clientConfig({ secretCrypto }, selected.storage),
  );
  try {
    return await storage.signRead(
      selected.object.key,
      method === 'HEAD'
        ? { method: 'HEAD' }
        : {
            method: 'GET',
            contentType:
              selected.version.mime === 'image/svg+xml'
                ? 'application/octet-stream'
                : selected.version.mime,
            contentDisposition: headers.get('content-disposition')!,
            cacheControl: headers.get('cache-control')!,
          },
    );
  } finally {
    storage.destroy();
  }
}

export function sameSignedTarget(a: Selection, b: Selection) {
  return (
    a.object.id === b.object.id &&
    a.actualVersion === b.actualVersion &&
    a.storage.id === b.storage.id &&
    a.storage.configRevision === b.storage.configRevision &&
    a.image.displayName === b.image.displayName &&
    a.version.mime === b.version.mime &&
    a.version.format === b.version.format
  );
}
