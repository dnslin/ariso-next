import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { initializeSiteSettings } from '../../../src/server/site/settings.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { startUploadRuntime } from '../../../src/server/upload/runtime.ts';
import { createSubmission } from '../../../src/server/upload/sessions.ts';
import { collectionFixture } from '../collections/helpers.ts';
import { startUploadEndpoint } from './s3-endpoint.ts';

export const uploadOrigin = 'http://ariso.test';

export async function createS3UploadFixture() {
  const endpoint = await startUploadEndpoint();
  const local = collectionFixture();
  local.db.transaction((tx) =>
    initializeSiteSettings(tx, {
      publicUrl: uploadOrigin,
      timeZone: 'Asia/Shanghai',
    }),
  );
  const storageId = `upload-162-${randomUUID()}`;
  const secretCrypto = createSecretCrypto(randomBytes(32));
  const temporaryRoot = join(local.storageRoot, '..', 'tmp');
  await mkdir(temporaryRoot);
  const bytes = await readFile('tests/fixtures/runtime/images/sample.png');
  const now = new Date();
  local.db
    .insert(storageConfigs)
    .values({
      id: storageId,
      name: 'S3 upload protocol fixture',
      type: 's3',
      enabled: true,
      endpoint: endpoint.target.endpoint,
      region: endpoint.target.region,
      bucket: endpoint.target.bucket,
      forcePathStyle: endpoint.target.forcePathStyle,
      pathPrefix: '',
      accessKeyEncrypted: secretCrypto.encryptSecret(
        endpoint.target.credentials.accessKeyId,
      ),
      secretKeyEncrypted: secretCrypto.encryptSecret(
        endpoint.target.credentials.secretAccessKey,
      ),
      connectionStatus: 'passed',
      connectionRevision: 1,
      corsStatus: 'passed',
      corsRevision: 1,
      corsOrigin: uploadOrigin,
      corsReport: {
        probeId: 'fixture-cors',
        storageId,
        revision: 1,
        origin: uploadOrigin,
        passed: true,
        stale: false,
        cleanupPending: false,
        stages: [],
        testedAt: now.toISOString(),
      },
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const context = {
    db: local.db,
    storageRoot: local.storageRoot,
    temporaryRoot,
    secretCrypto,
    logger: { info() {}, error() {} },
  };
  const runtime = startUploadRuntime(context);
  function submission(
    input: {
      bytes?: Buffer;
      declaredMime?: string;
      originalName?: string;
      albumIds?: string[];
      tagIds?: string[];
    } = {},
  ) {
    return createSubmission(local.db, {
      requestId: randomUUID(),
      storageId,
      files: [
        {
          queueItemId: randomUUID(),
          originalName: input.originalName ?? '旅行.fake',
          declaredSize: (input.bytes ?? bytes).length,
          declaredMime: input.declaredMime ?? 'application/octet-stream',
        },
      ],
      albumIds: input.albumIds,
      tagIds: input.tagIds,
    });
  }
  function path(key: string) {
    return `/${endpoint.target.bucket}/ariso/${storageId}/${key}`;
  }
  function cors(values: Partial<typeof storageConfigs.$inferInsert>) {
    local.db
      .update(storageConfigs)
      .set(values)
      .where(eq(storageConfigs.id, storageId))
      .run();
  }
  return {
    ...local,
    endpoint,
    storageId,
    bytes,
    context,
    runtime,
    temporaryRoot,
    submission,
    path,
    cors,
    async close() {
      try {
        await runtime.stop();
      } finally {
        try {
          await endpoint.close();
        } finally {
          local.close();
        }
      }
    },
  };
}

export function uploadRequest(bytes: Buffer, declaredMime = 'image/png') {
  const body = new FormData();
  body.append(
    'file',
    new Blob([new Uint8Array(bytes)], { type: declaredMime }),
    'photo.fake',
  );
  return new Request(`${uploadOrigin}/content`, { method: 'POST', body });
}
