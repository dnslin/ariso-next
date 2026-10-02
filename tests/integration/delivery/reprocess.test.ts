import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestReprocess } from '../../../src/server/media/reprocess.ts';
import {
  mediaObjects,
  mediaVersions,
  type VersionKind,
} from '../../../src/server/media/schema.ts';
import { patchMediaSettings } from '../../../src/server/media/settings.ts';
import * as local from '../../../src/server/storage/local.ts';
import { createMediaDeliveryFixture } from './media-fixture.ts';

let app: Awaited<ReturnType<typeof createMediaDeliveryFixture>>;
beforeEach(async () => {
  app = await createMediaDeliveryFixture();
  patchMediaSettings(app.db, {
    watermarkMode: 'text',
    watermarkText: 'A',
    watermarkFont: 'latin',
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
});
async function delivered(imageId: string, kind?: VersionKind) {
  const response = await app.request(imageId, kind ? `?type=${kind}` : '');
  expect(response.status).toBe(200);
  return {
    etag: response.headers.get('etag'),
    mime: response.headers.get('content-type'),
    kind: response.headers.get('x-ariso-image-version'),
    bytes: Buffer.from(await response.arrayBuffer()),
  };
}
const kinds = ['original', 'compressed', 'thumbnail', 'watermark'] as const;
async function deliveredVersions(imageId: string) {
  const entries = await Promise.all(
    kinds.map(async (kind) => [kind, await delivered(imageId, kind)] as const),
  );
  return Object.fromEntries(entries) as Record<
    VersionKind,
    Awaited<ReturnType<typeof delivered>>
  >;
}

describe('T-DEL-02 local media reprocessing and stable delivery links', () => {
  it.each(['success', 'write-failure', 'publish-failure'] as const)(
    'keeps published bytes throughout real candidate generation (%s)',
    async (outcome) => {
      const asset = await app.accept(
        'tests/fixtures/runtime/images/sample.png',
      );
      const before = await deliveredVersions(asset.imageId);
      const defaultBefore = await delivered(asset.imageId);
      expect(defaultBefore).toEqual(before.compressed);
      patchMediaSettings(app.db, {
        outputFormat: 'jpeg',
        quality: 47,
        maxEdge: 32,
      });
      const accepted = requestReprocess(app.db, asset.imageId, {
        scope: 'all',
      });
      expect(await deliveredVersions(asset.imageId)).toEqual(before);
      expect(await delivered(asset.imageId)).toEqual(defaultBefore);
      if (outcome === 'publish-failure') {
        // Failing the second selected reference proves the complete publication
        // transaction rolls back, including its already attempted first update.
        app.db.$client.exec(
          "CREATE TRIGGER reject_delivery_publication BEFORE UPDATE OF object_id ON media_versions WHEN NEW.kind='thumbnail' BEGIN SELECT RAISE(ABORT, 'injected delivery publication failure'); END",
        );
      }
      const actualWrite = local.writeObject;
      const observedCandidates: string[] = [];
      vi.spyOn(local, 'writeObject').mockImplementation(async (...args) => {
        const saved = await actualWrite(...args);
        const kind = ['compressed', 'thumbnail', 'watermark'].find((value) =>
          args[2].key.includes(`/${value}/`),
        );
        if (!kind) throw new Error(`Unexpected candidate key: ${args[2].key}`);
        observedCandidates.push(kind);
        const stored = app.db
          .select()
          .from(mediaObjects)
          .where(
            and(
              eq(mediaObjects.jobId, accepted.jobId),
              eq(mediaObjects.status, 'stored'),
              eq(mediaObjects.purpose, 'compressed'),
            ),
          )
          .get();
        if (kind !== 'compressed') {
          expect(stored).toBeDefined();
          expect(stored!.id).not.toBe(
            app
              .state(asset.imageId)
              .versions.find((row) => row.kind === 'compressed')!.saved!.object
              .id,
          );
        }
        // Actual output already exists on disk while this async step is paused.
        // None of the default or explicit links may expose these candidate bytes.
        expect(await deliveredVersions(asset.imageId)).toEqual(before);
        expect(await delivered(asset.imageId)).toEqual(defaultBefore);
        expect(app.state(asset.imageId).image.processingStatus).toBe('ready');
        if (outcome === 'write-failure' && kind === 'thumbnail')
          throw Object.assign(
            new Error('injected delivery candidate write failure'),
            {
              code: 'EACCES',
            },
          );
        return saved;
      });
      const result = await app.processNext();
      expect(observedCandidates).toEqual(
        outcome === 'write-failure'
          ? ['compressed', 'thumbnail']
          : ['compressed', 'thumbnail', 'watermark'],
      );
      expect(result.status).toBe(
        outcome === 'success' ? 'succeeded' : 'failed',
      );
      if (outcome !== 'success') {
        expect(result.error).toContain(
          outcome === 'write-failure'
            ? 'injected delivery candidate write failure'
            : 'injected delivery publication failure',
        );
        expect(await deliveredVersions(asset.imageId)).toEqual(before);
        expect(await delivered(asset.imageId)).toEqual(defaultBefore);
      } else {
        const after = await deliveredVersions(asset.imageId);
        expect(after.original).toEqual(before.original);
        for (const kind of ['compressed', 'thumbnail', 'watermark'] as const) {
          expect(after[kind].etag).not.toBe(before[kind].etag);
          const published = app
            .state(asset.imageId)
            .versions.find((row) => row.kind === kind)!.saved!;
          expect(after[kind].etag).toBe(`"${published.object.id}"`);
          expect(published.object.jobId).toBe(accepted.jobId);
        }
        for (const kind of ['compressed', 'watermark'] as const) {
          expect(after[kind].mime).toBe('image/jpeg');
          expect(after[kind].bytes.subarray(0, 2)).toEqual(
            Buffer.from([0xff, 0xd8]),
          );
          expect(after[kind].bytes).not.toEqual(before[kind].bytes);
        }
        expect(await delivered(asset.imageId)).toEqual(after.compressed);
        const oldConditional = await app.request(
          asset.imageId,
          '?type=compressed',
          {
            headers: { 'if-none-match': before.compressed.etag! },
          },
        );
        expect(oldConditional.status).toBe(200);
        expect(Buffer.from(await oldConditional.arrayBuffer())).toEqual(
          after.compressed.bytes,
        );
      }
      expect(app.state(asset.imageId).image).toMatchObject({
        id: asset.imageId,
        processingStatus: 'ready',
      });
    },
  );

  it('continues serving saved disabled versions after an all-scope reprocess', async () => {
    const asset = await app.accept('tests/fixtures/runtime/images/sample.png');
    const before = await deliveredVersions(asset.imageId);
    patchMediaSettings(app.db, {
      compressionEnabled: false,
      watermarkMode: 'off',
      defaultLinkVersion: 'original',
    });
    for (const kind of ['compressed', 'watermark'] as const)
      expect(await delivered(asset.imageId, kind)).toEqual(before[kind]);
    const accepted = requestReprocess(app.db, asset.imageId, { scope: 'all' });
    expect((await app.processNext()).status).toBe('succeeded');
    expect(app.job(accepted.jobId).expectedVersions).toEqual(['thumbnail']);
    for (const kind of ['original', 'compressed', 'watermark'] as const)
      expect(await delivered(asset.imageId, kind)).toEqual(before[kind]);
    expect((await delivered(asset.imageId, 'thumbnail')).etag).not.toBe(
      before.thumbnail.etag,
    );
    expect(await delivered(asset.imageId)).toEqual(before.original);
  });

  it('rejects an applicable missing version when compression was disabled at upload', async () => {
    patchMediaSettings(app.db, {
      compressionEnabled: false,
      watermarkMode: 'off',
      defaultLinkVersion: 'original',
    });
    const asset = await app.accept('tests/fixtures/runtime/images/sample.png');
    expect(
      app.db
        .select()
        .from(mediaVersions)
        .where(eq(mediaVersions.kind, 'compressed'))
        .all(),
    ).toEqual([]);
    patchMediaSettings(app.db, {
      compressionEnabled: true,
      defaultLinkVersion: 'compressed',
    });
    for (const query of ['', '?type=compressed']) {
      const response = await app.request(asset.imageId, query);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        code: 'VERSION_UNAVAILABLE',
      });
    }
    expect((await delivered(asset.imageId, 'original')).bytes).toEqual(
      asset.bytes,
    );
  });
});
