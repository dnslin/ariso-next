import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import { albums, albumImages } from '../../../src/server/collections/schema.ts';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { prepareLocalObjectPath } from '../../../src/server/storage/local.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { email, password, seedAuthOwner } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

it('serves isolated persisted usage and counts only to the owner, preserves unknown objects, and reports read failures', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ariso-analytics-usage-http-'));
  const data = join(directory, 'data');
  const server = await launch(resolve('.next/standalone'), directory, {
    DATA_DIR: data,
    HOST: '127.0.0.1',
  });
  let live: ReturnType<typeof openRuntimeDatabase> | undefined;
  try {
    const origin = `http://127.0.0.1:${server.port}`;
    await vi.waitFor(
      async () => {
        if (server.child.exitCode !== null) throw new Error(server.logs());
        expect((await fetch(`${origin}/api/health`)).status).toBe(200);
      },
      { timeout: 15000 },
    );
    live = openRuntimeDatabase(join(data, 'ariso.db'));
    await seedAuthOwner(live, origin);
    const login = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const { token } = await login.json();
    const headers = { cookie, origin, 'content-type': 'application/json' };
    const createdToken = await fetch(`${origin}/api/upload-tokens`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'analytics-auth-boundary' }),
    });
    expect(createdToken.status).toBe(200);
    const { key: uploadKey } = await createdToken.json();
    expect(uploadKey).toEqual(expect.any(String));
    const paths = ['/api/analytics/usage', '/api/analytics/overview'];
    for (const credentials of [
      {},
      { authorization: `Bearer ${token}` },
      { cookie: `ariso.share_token=${token}` },
      { authorization: `Bearer ${uploadKey}` },
      { 'x-api-key': uploadKey },
    ] as Record<string, string>[]) {
      for (const path of paths) {
        const response = await fetch(`${origin}${path}`, {
          headers: credentials,
        });
        expect(response.status).toBe(401);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
      }
    }
    for (const path of paths) {
      const response = await fetch(`${origin}${path}`, {
        method: 'POST',
        headers,
        body: '{}',
      });
      expect(response.status).toBe(405);
    }
    const read = async (path: string) => {
      const response = await fetch(`${origin}${path}`, { headers });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const body = await response.json();
      expect(Number.isFinite(Date.parse(body.generatedAt))).toBe(true);
      return body;
    };
    expect((await read('/api/analytics/overview')).counts).toEqual({
      normalImages: 0,
      recycledImages: 0,
      initialProcessingFailures: 0,
      reprocessFailures: 0,
      albums: 0,
    });
    const empty = await read('/api/analytics/usage');
    expect(empty.scope).toBe('registered-objects');
    expect(empty.storages).toHaveLength(1);
    expect(empty.storages[0]).toMatchObject({
      knownBytes: 0,
      unconfirmedObjects: 0,
      groups: { original: 0, derived: 0, recycle: 0, pending: 0 },
      confirmationStatus: 'confirmed',
      confirmedAt: null,
    });

    const db = live.db;
    const storage = db.select().from(storageConfigs).get()!;
    expect(storage.type).toBe('local');
    expect(storage.localPath).toEqual(expect.any(String));
    const confirmedAt = new Date(1000);
    const fixtures = [
      {
        id: 'usage-public',
        bytes: 100,
        visibility: 'public',
        status: 'ready',
        trashedAt: null,
      },
      {
        id: 'usage-private-failed',
        bytes: 23,
        visibility: 'private',
        status: 'failed',
        trashedAt: null,
      },
      {
        id: 'usage-recycled',
        bytes: 17,
        visibility: 'public',
        status: 'ready',
        trashedAt: confirmedAt,
      },
    ] as const;
    db.transaction((tx) => {
      for (const image of fixtures) {
        tx.insert(mediaImages)
          .values({
            id: image.id,
            storageId: storage.id,
            originalName: `${image.id}.png`,
            displayName: `${image.id}.png`,
            visibility: image.visibility,
            format: 'PNG',
            mime: 'image/png',
            byteSize: image.bytes,
            processingStatus: image.status,
            trashedAt: image.trashedAt,
            createdAt: confirmedAt,
            updatedAt: confirmedAt,
          })
          .run();
        tx.insert(mediaObjects)
          .values({
            id: `object-${image.id}`,
            imageId: image.id,
            storageId: storage.id,
            key: `original/${image.id}.png`,
            purpose: 'original',
            status: 'stored',
            byteSize: image.bytes,
            byteSizeConfirmedAt: confirmedAt,
            createdAt: confirmedAt,
            updatedAt: confirmedAt,
          })
          .run();
        tx.insert(mediaVersions)
          .values({
            imageId: image.id,
            kind: 'original',
            objectId: `object-${image.id}`,
            byteSize: image.bytes,
            format: 'PNG',
            mime: 'image/png',
            createdAt: confirmedAt,
          })
          .run();
      }
      tx.insert(mediaObjects)
        .values({
          id: 'object-writing',
          imageId: fixtures[0].id,
          storageId: storage.id,
          key: 'candidate/unconfirmed',
          purpose: 'temporary',
          status: 'writing',
          byteSize: 999,
          createdAt: confirmedAt,
          updatedAt: confirmedAt,
        })
        .run();
      tx.insert(albums)
        .values(
          ['empty', 'associated'].map((id) => ({
            id,
            name: id,
            description: '',
            createdAt: confirmedAt,
            updatedAt: confirmedAt,
          })),
        )
        .run();
      tx.insert(albumImages)
        .values(
          fixtures.slice(0, 2).map((image) => ({
            albumId: 'associated',
            imageId: image.id,
            joinedAt: confirmedAt,
          })),
        )
        .run();
    });
    // Register responsibility before creating files so background orphan scans protect them.
    for (const image of fixtures) {
      writeFileSync(
        prepareLocalObjectPath(
          join(data, 'storage'),
          {
            id: storage.id,
            localPath: storage.localPath!,
            enabled: storage.enabled,
          },
          `original/${image.id}.png`,
        ),
        Buffer.alloc(image.bytes),
      );
    }
    db.update(storageConfigs)
      .set({ enabled: false })
      .where(eq(storageConfigs.id, storage.id))
      .run();
    const counts = {
      normalImages: 2,
      recycledImages: 1,
      initialProcessingFailures: 1,
      reprocessFailures: 0,
      albums: 2,
    };
    for (const query of ['', '?days=7', '?days=30', '?days=90']) {
      expect((await read(`/api/analytics/overview${query}`)).counts).toEqual(
        counts,
      );
    }
    for (const query of [
      '?days=',
      '?days=1',
      '?days=7.0',
      '?days=foo',
      '?days=7&days=30',
    ]) {
      const response = await fetch(`${origin}/api/analytics/overview${query}`, {
        headers,
      });
      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
    const usage = await read('/api/analytics/usage');
    expect(usage.storages).toEqual([
      {
        id: storage.id,
        name: storage.name,
        type: 'local',
        enabled: false,
        knownBytes: 140,
        unconfirmedObjects: 1,
        groups: { original: 123, derived: 0, recycle: 17, pending: 0 },
        confirmationStatus: 'unconfirmed',
        confirmedAt: confirmedAt.toISOString(),
      },
    ]);
    for (const privateValue of [
      storage.localPath!,
      uploadKey,
      'original/usage-public.png',
      'candidate/unconfirmed',
    ]) {
      expect(JSON.stringify(usage)).not.toContain(privateValue);
    }

    db.$client.exec(
      'ALTER TABLE media_images RENAME TO unavailable_media_images',
    );
    try {
      for (const path of paths) {
        const response = await fetch(`${origin}${path}`, { headers });
        expect(response.status).toBe(500);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        const body = await response.json();
        expect(body).toMatchObject({ code: 'ANALYTICS_READ_FAILED' });
        expect(body).not.toHaveProperty('counts');
        expect(body).not.toHaveProperty('storages');
        await vi.waitFor(() => {
          const records = server
            .logs()
            .split('\n')
            .flatMap((line) => {
              try {
                return [JSON.parse(line)];
              } catch {
                return [];
              }
            });
          expect(records).toContainEqual(
            expect.objectContaining({
              module: 'analytics.http',
              path,
              msg: 'Analytics read failed',
            }),
          );
        });
      }
    } finally {
      db.$client.exec(
        'ALTER TABLE unavailable_media_images RENAME TO media_images',
      );
    }
    expect((await read('/api/analytics/overview')).counts).toEqual(counts);
    expect((await read('/api/analytics/usage')).storages).toEqual(
      usage.storages,
    );
  } finally {
    live?.close();
    await stop(server.child, server.closed);
    rmSync(directory, { recursive: true, force: true });
  }
}, 45000);
