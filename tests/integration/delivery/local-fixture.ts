import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import { mediaImages, mediaJobs } from '../../../src/server/media/schema.ts';
import { createProcessingSnapshot } from '../../../src/server/media/settings.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { resolveUploadStorage } from '../../../src/server/storage/defaults.ts';
import {
  planLocalWrite,
  writeObject,
} from '../../../src/server/storage/local.ts';
import { email, password, seedAuthOwner } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

export async function launchLocalDelivery() {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-delivery-http-'));
  const dataDir = join(directory, 'data');
  const server = await launch(resolve('.next/standalone'), directory, {
    DATA_DIR: dataDir,
    HOST: '127.0.0.1',
  });
  const origin = `http://127.0.0.1:${server.port}`;
  let connection: ReturnType<typeof openRuntimeDatabase> | undefined;
  const close = async () => {
    try {
      await stop(server.child, server.closed);
    } finally {
      try {
        connection?.close();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  };
  try {
    const deadline = Date.now() + 15000;
    while (true) {
      if (server.child.exitCode !== null || Date.now() > deadline)
        throw new Error(server.logs());
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
        /* Retry only while the server is starting, bounded by deadline. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    connection = openRuntimeDatabase(join(dataDir, 'ariso.db'));
    const { db } = connection;
    await seedAuthOwner(connection, origin);
    const login = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!login.ok) throw new Error(await login.text());
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const token = (await login.json()).token as string;
    const storage = resolveUploadStorage(db);
    async function seed(svg = false) {
      const bytes = svg
        ? Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>',
          )
        : await readFile(resolve('tests/fixtures/runtime/images/sample.png'));
      const plan = planLocalWrite('uploads');
      await writeObject(
        join(dataDir, 'storage'),
        storage,
        plan,
        Readable.from(bytes),
      );
      const imageId = randomUUID();
      db.transaction((tx) => {
        const accepted = acceptOriginal(tx, {
          imageId,
          storageId: storage.id,
          key: plan.key,
          originalName: svg ? 'original.svg' : 'original.png',
          visibility: 'public',
          format: svg ? 'SVG' : 'PNG',
          mime: svg ? 'image/svg+xml' : 'image/png',
          byteSize: bytes.length,
          snapshot: createProcessingSnapshot(tx),
          expectedVersions: [],
        });
        // Published original fixture; no derived processing is claimed or queued.
        tx.update(mediaJobs)
          .set({ status: 'succeeded' })
          .where(eq(mediaJobs.id, accepted.jobId))
          .run();
        tx.update(mediaImages)
          .set({
            processingStatus: 'ready',
            classification: svg ? 'preview_only' : 'static',
            displayName: svg ? '旅行.svg' : '旅行.final',
          })
          .where(eq(mediaImages.id, imageId))
          .run();
      });
      return {
        imageId,
        bytes,
        path: join(
          dataDir,
          'storage',
          storage.localPath,
          'ariso',
          storage.id,
          plan.key,
        ),
      };
    }
    return {
      origin,
      cookie,
      token,
      db,
      storage,
      seed,
      close,
      logs: server.logs,
      child: server.child,
      closed: server.closed,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
