import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import {
  createS3Storage,
  type S3StorageConfig,
} from '../../../src/server/storage/s3.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import { createProcessingSnapshot } from '../../../src/server/media/settings.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
  type VersionKind,
} from '../../../src/server/media/schema.ts';
import { email, password, seedAuthOwner } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';
import { startProtocolEndpoint } from './s3-endpoint.ts';

export type DeliveryTarget = Pick<
  S3StorageConfig,
  'endpoint' | 'region' | 'bucket' | 'forcePathStyle' | 'credentials'
> & {
  service: 'r2' | 'seaweedfs';
  serviceVersion?: string;
};
export type DeliveryAsset = {
  imageId: string;
  bytes: Buffer;
  file: string;
  objectId: string;
};

export async function launchS3Delivery(
  target: DeliveryTarget,
  evidencePath?: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), 'ariso-delivery-s3-'));
  const dataDir = join(directory, 'data');
  const encryptionKey = randomBytes(32);
  const secretCrypto = createSecretCrypto(encryptionKey);
  const server = await launch(resolve('.next/standalone'), directory, {
    DATA_DIR: dataDir,
    HOST: '127.0.0.1',
    ARISO_ENCRYPTION_KEY: encryptionKey.toString('hex'),
    PATH: `${process.env.PATH}`,
    https_proxy: process.env.https_proxy,
    http_proxy: process.env.http_proxy,
    all_proxy: process.env.all_proxy,
    NO_PROXY: process.env.NO_PROXY,
    no_proxy: process.env.no_proxy,
  });
  const origin = `http://127.0.0.1:${server.port}`;
  const storageId = `delivery-161-${randomUUID()}`;
  const storage = createS3Storage({
    ...target,
    id: storageId,
    pathPrefix: '',
    enabled: true,
  });
  const keys: string[] = [];
  let connection: ReturnType<typeof openRuntimeDatabase> | undefined;
  const persistKeys = async () => {
    if (evidencePath)
      await writeFile(
        evidencePath,
        JSON.stringify({ storageId, keys }, null, 2) + '\n',
      );
  };
  const shutdown = () => stop(server.child, server.closed);
  const close = async () => {
    const failures: unknown[] = [];
    try {
      await shutdown();
      for (const key of keys) {
        try {
          await storage.deleteObject(key, {
            signal: AbortSignal.timeout(30000),
          });
          assert.equal(
            await storage.inspectObject(key, {
              signal: AbortSignal.timeout(30000),
            }),
            null,
          );
        } catch (error) {
          failures.push(error);
        }
      }
    } finally {
      storage.destroy();
      connection?.close();
      await rm(directory, { recursive: true, force: true });
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        'Delivery fixture exact-key cleanup failed',
      );
  };
  try {
    const deadline = Date.now() + 15000;
    while (true) {
      signal?.throwIfAborted();
      if (server.child.exitCode !== null || Date.now() > deadline) {
        const logs = server
          .logs()
          .replace(/("code"\s*:\s*")[^"]+/g, '$1[redacted]');
        throw new Error(`Delivery server did not become healthy: ${logs}`);
      }
      try {
        if (
          (
            await fetch(`${origin}/api/health`, {
              signal: AbortSignal.timeout(500),
            })
          ).ok
        )
          break;
      } catch {
        /* Bounded startup polling only. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    connection = openRuntimeDatabase(join(dataDir, 'ariso.db'));
    const { db } = connection;
    await seedAuthOwner(connection, origin);
    const now = new Date();
    db.insert(storageConfigs)
      .values({
        id: storageId,
        name: 'Delivery protocol fixture',
        type: 's3',
        enabled: true,
        endpoint: target.endpoint,
        region: target.region,
        bucket: target.bucket,
        pathPrefix: '',
        forcePathStyle: target.forcePathStyle,
        accessKeyEncrypted: secretCrypto.encryptSecret(
          target.credentials.accessKeyId,
        ),
        secretKeyEncrypted: secretCrypto.encryptSecret(
          target.credentials.secretAccessKey,
        ),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const login = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.ok(login.ok, 'Fixture owner login failed');
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const token = (await login.json()).token as string;
    await mkdir(join(directory, 'assets'));
    async function seed(
      options: {
        file?: string;
        bytes?: Buffer;
        format?: string;
        mime?: string;
        classification?: 'static' | 'animated' | 'preview_only';
        visibility?: 'public' | 'private';
        fourVersions?: boolean;
      } = {},
    ): Promise<DeliveryAsset> {
      const bytes =
        options.bytes ??
        (await readFile(
          resolve(options.file ?? 'tests/fixtures/runtime/images/sample.png'),
        ));
      const format = options.format ?? 'PNG';
      const mime = options.mime ?? 'image/png';
      const imageId = randomUUID();
      const key = `images/${imageId}/original/中文 +%?.${format.toLowerCase()}`;
      keys.push(key);
      await persistKeys();
      await storage.writeObject(key, Readable.from([bytes]), {
        signal,
        size: bytes.length,
        contentType: mime,
      });
      const file = join(
        directory,
        'assets',
        `${imageId}.${format.toLowerCase()}`,
      );
      await writeFile(file, bytes);
      const asset = db.transaction(
        (tx) => {
          const accepted = acceptOriginal(tx, {
            imageId,
            storageId,
            key,
            originalName: `旅行.final.${format.toLowerCase()}`,
            visibility: options.visibility ?? 'public',
            format,
            mime,
            byteSize: bytes.length,
            classification: options.classification ?? 'static',
            snapshot: {
              ...createProcessingSnapshot(tx),
              watermarkMode: options.fourVersions ? 'text' : 'off',
            },
            expectedVersions: [],
          });
          tx.update(mediaJobs)
            .set({ status: 'succeeded' })
            .where(eq(mediaJobs.id, accepted.jobId))
            .run();
          tx.update(mediaImages)
            .set({ processingStatus: 'ready', displayName: '旅行.final' })
            .where(eq(mediaImages.id, imageId))
            .run();
          return accepted;
        },
        { behavior: 'immediate' },
      );
      // Known published fixtures exercise delivery selection only. No image-processing evidence is claimed.
      if (options.fourVersions) {
        for (const kind of ['compressed', 'thumbnail', 'watermark'] as const)
          await publish(imageId, kind, bytes);
      }
      return { imageId, bytes, file, objectId: asset.objectId };
    }
    async function publish(
      imageId: string,
      kind: Exclude<VersionKind, 'original'>,
      bytes: Buffer,
    ) {
      const id = randomUUID();
      const key = `images/${imageId}/${kind}/${id}.png`;
      keys.push(key);
      await persistKeys();
      await storage.writeObject(key, Readable.from([bytes]), {
        signal,
        size: bytes.length,
        contentType: 'image/png',
      });
      db.transaction(
        (tx) => {
          tx.insert(mediaObjects)
            .values({
              id,
              imageId,
              storageId,
              key,
              purpose: kind,
              status: 'stored',
              byteSize: bytes.length,
              format: 'PNG',
              mime: 'image/png',
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .run();
          tx.insert(mediaVersions)
            .values({
              imageId,
              kind,
              objectId: id,
              byteSize: bytes.length,
              format: 'PNG',
              mime: 'image/png',
              createdAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [mediaVersions.imageId, mediaVersions.kind],
              set: { objectId: id, byteSize: bytes.length },
            })
            .run();
        },
        { behavior: 'immediate' },
      );
      return id;
    }
    return {
      origin,
      db,
      directory,
      storageId,
      storage,
      keys,
      cookie,
      token,
      seed,
      publish,
      shutdown,
      close,
    };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Delivery setup failed: ${error instanceof Error ? error.message : String(error)}; exact cleanup also failed`,
        { cause: error },
      );
    }
    throw error;
  }
}

export async function launchProtocolDelivery() {
  const endpoint = await startProtocolEndpoint();
  let app: Awaited<ReturnType<typeof launchS3Delivery>> | undefined;
  try {
    app = await launchS3Delivery(endpoint.target);
    const delivery = app;
    const publicAsset = await app.seed({ fourVersions: true });
    const privateAsset = await app.seed({
      visibility: 'private',
      fourVersions: true,
    });
    const svgAsset = await app.seed({
      file: 'tests/fixtures/media-formats/static.svg',
      format: 'SVG',
      mime: 'image/svg+xml',
      classification: 'preview_only',
    });
    return {
      ...app,
      endpoint,
      publicAsset,
      privateAsset,
      svgAsset,
      browserInput: {
        origin: app.origin,
        embedOrigin: endpoint.embedOrigin,
        publicImageId: publicAsset.imageId,
        privateImageId: privateAsset.imageId,
        svgImageId: svgAsset.imageId,
        samplePath: publicAsset.file,
        svgPath: svgAsset.file,
        credentials: { email, password },
      },
      async close() {
        try {
          await delivery.close();
        } finally {
          await endpoint.close();
        }
      },
    };
  } catch (error) {
    try {
      await app?.close();
    } finally {
      await endpoint.close();
    }
    throw error;
  }
}
