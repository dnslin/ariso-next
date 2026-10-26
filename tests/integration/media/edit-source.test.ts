import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import { GET as sourceGet } from '../../../src/app/api/images/[id]/edit/source/route.ts';
import { POST as previewPost } from '../../../src/app/api/images/[id]/edit/preview/route.ts';
import { emptyImageEditRecipe } from '../../../src/shared/image-editing.ts';
import { createEditPreviewRuntime } from '../../../src/server/media/edit-preview.ts';
import { requestImageEdit } from '../../../src/server/media/edit-requests.ts';
import { readEditSource } from '../../../src/server/media/edit-source.ts';
import type { MediaRuntime } from '../../../src/server/media/process.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaSettings,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';

vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));

let fixture: ReturnType<typeof collectionFixture>;
let runtime: MediaRuntime;
let previews: ReturnType<typeof createEditPreviewRuntime>;
beforeEach(async () => {
  fixture = collectionFixture();
  runtime = {
    db: fixture.db,
    storageRoot: fixture.storageRoot,
    temporaryRoot: join(dirname(fixture.storageRoot), 'tmp'),
    logger: { info: vi.fn(), error: vi.fn() },
  };
  previews = createEditPreviewRuntime(runtime, (operation, signal) =>
    operation(signal),
  );
  await previews.ready;
  vi.mocked(getServerRuntime).mockReturnValue({
    connection: { db: fixture.db },
    config: {
      dataDir: dirname(fixture.storageRoot),
      encryptionKey: Buffer.alloc(32),
      logLevel: 'fatal',
    },
    editPreviews: previews,
  } as ReturnType<typeof getServerRuntime>);
});
afterEach(async () => {
  await previews.close();
  fixture.close();
  vi.restoreAllMocks();
});
function source() {
  const id = fixture.image();
  fixture.db
    .update(mediaJobs)
    .set({ status: 'succeeded' })
    .where(eq(mediaJobs.imageId, id))
    .run();
  fixture.db
    .update(mediaImages)
    .set({ processingStatus: 'ready', classification: 'static' })
    .where(eq(mediaImages.id, id))
    .run();
  const object = fixture.db
    .select({ object: mediaObjects })
    .from(mediaVersions)
    .innerJoin(mediaObjects, eq(mediaObjects.id, mediaVersions.objectId))
    .where(
      and(eq(mediaVersions.imageId, id), eq(mediaVersions.kind, 'original')),
    )
    .get()!.object;
  return { id, object };
}
function input(sourceObjectId: string) {
  const recipe = emptyImageEditRecipe();
  recipe.watermark = { ...recipe.watermark, enabled: true, text: 'Edited' };
  return { sourceObjectId, recipe };
}
async function expectHttpError(
  imageId: string,
  objectId: string,
  status: number,
  code: string,
  message: string,
) {
  const path = `http://ariso.test/api/images/${imageId}/edit`;
  const context = { params: Promise.resolve({ id: imageId }) };
  for (const response of [
    await sourceGet(
      new Request(`${path}/source?objectId=${objectId}`),
      context,
    ),
    await previewPost(
      new Request(`${path}/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input(objectId)),
      }),
      context,
    ),
  ]) {
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ code, message });
  }
}

describe('image edit original admission', () => {
  it('reads the current original and its storage without site watermark settings', () => {
    const image = source();
    fixture.db.delete(mediaSettings).run();
    expect(readEditSource(runtime, image.id, image.object.id)).toEqual({
      image: fixture.db
        .select()
        .from(mediaImages)
        .where(eq(mediaImages.id, image.id))
        .get(),
      object: image.object,
      storage: fixture.storage,
    });
  });

  it('rejects an old published object after the current original changes', async () => {
    const image = source();
    const current = {
      ...image.object,
      id: randomUUID(),
      key: `uploads/${randomUUID()}.png`,
    };
    fixture.db.insert(mediaObjects).values(current).run();
    fixture.db
      .update(mediaVersions)
      .set({ objectId: current.id })
      .where(
        and(
          eq(mediaVersions.imageId, image.id),
          eq(mediaVersions.kind, 'original'),
        ),
      )
      .run();
    expect(readEditSource(runtime, image.id, current.id).object).toEqual(
      current,
    );
    expect(() =>
      requestImageEdit(fixture.db, image.id, {
        requestId: randomUUID(),
        ...input(image.object.id),
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'MEDIA_EDIT_SOURCE_CHANGED' }),
    );
    await expectHttpError(
      image.id,
      image.object.id,
      409,
      'MEDIA_EDIT_SOURCE_CHANGED',
      '原图已变化，请重新打开编辑器',
    );
  });

  it.each([
    {
      name: 'trashed image',
      patch: { trashedAt: new Date() },
      code: 'MEDIA_IMAGE_UNAVAILABLE',
      message: '仅可编辑未回收且已就绪的图片',
    },
    {
      name: 'unfinished image',
      patch: { processingStatus: 'pending' as const },
      code: 'MEDIA_IMAGE_UNAVAILABLE',
      message: '仅可编辑未回收且已就绪的图片',
    },
    {
      name: 'unsupported image',
      patch: { format: 'GIF', classification: 'animated' as const },
      code: 'MEDIA_EDIT_FORMAT_UNSUPPORTED',
      message: '当前仅支持 JPEG、PNG 和静态 WebP 图片编辑',
    },
  ])(
    'uses the same admission for a $name',
    async ({ patch, code, message }) => {
      const image = source();
      fixture.db
        .update(mediaImages)
        .set(patch)
        .where(eq(mediaImages.id, image.id))
        .run();
      expect(() =>
        requestImageEdit(fixture.db, image.id, {
          requestId: randomUUID(),
          ...input(image.object.id),
        }),
      ).toThrowError(expect.objectContaining({ code, status: 409, message }));
      await expectHttpError(image.id, image.object.id, 409, code, message);
    },
  );

  it('preserves a missing image error for both owner read routes', async () => {
    await expectHttpError(
      randomUUID(),
      randomUUID(),
      404,
      'MEDIA_IMAGE_NOT_FOUND',
      '图片不存在',
    );
  });

  it('rejects disabled storage before serving or rendering the original', async () => {
    const image = source();
    fixture.db
      .update(storageConfigs)
      .set({ enabled: false })
      .where(eq(storageConfigs.id, fixture.storage.id))
      .run();
    await expectHttpError(
      image.id,
      image.object.id,
      409,
      'STORAGE_DISABLED',
      '图片所属存储已停用',
    );
  });

  it.each(['missing', 'writing'] as const)(
    'rejects a %s original before reading source bytes',
    async (state) => {
      const image = source();
      if (state === 'missing')
        fixture.db
          .delete(mediaVersions)
          .where(
            and(
              eq(mediaVersions.imageId, image.id),
              eq(mediaVersions.kind, 'original'),
            ),
          )
          .run();
      else
        fixture.db
          .update(mediaObjects)
          .set({ status: 'writing' })
          .where(eq(mediaObjects.id, image.object.id))
          .run();
      await expectHttpError(
        image.id,
        image.object.id,
        409,
        'MEDIA_EDIT_SOURCE_UNAVAILABLE',
        '当前原图尚不可用',
      );
    },
  );
});
