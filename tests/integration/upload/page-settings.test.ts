import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mediaSettings } from '../../../src/server/media/schema.ts';
import {
  storageConfigs,
  storageSettings,
} from '../../../src/server/storage/schema.ts';
import { readUploadPageSettings } from '../../../src/server/upload/page-settings.ts';
import { uploadSettings } from '../../../src/server/upload/schema.ts';
import { collectionFixture } from '../collections/helpers.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => fixture.close());

describe('upload page settings', () => {
  it('reads current defaults and exposes only local storage labels and availability', () => {
    const { db, storage } = fixture;
    db.update(uploadSettings).set({ maxFileBytes: 12345 }).run();
    db.update(mediaSettings).set({ defaultVisibility: 'private' }).run();
    db.insert(storageConfigs)
      .values({
        ...storage,
        id: 'disabled',
        name: '已停用的本地存储',
        enabled: false,
        localPath: 'private/local/path',
      })
      .run();
    const result = readUploadPageSettings(db);
    expect(result).toEqual({
      maxFileBytes: 12345,
      defaultVisibility: 'private',
      defaultStorageId: storage.id,
      storages: expect.arrayContaining([
        { id: storage.id, name: storage.name, enabled: true },
        { id: 'disabled', name: '已停用的本地存储', enabled: false },
      ]),
    });
    expect(result.storages).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain('localPath');
    expect(JSON.stringify(result)).not.toContain('private/local/path');
  });

  it('preserves unset and disabled defaults without selecting another storage', () => {
    const { db, storage } = fixture;
    db.update(storageSettings).set({ defaultStorageId: null }).run();
    expect(readUploadPageSettings(db).defaultStorageId).toBeNull();
    db.update(storageSettings).set({ defaultStorageId: storage.id }).run();
    db.update(storageConfigs)
      .set({ enabled: false })
      .where(eq(storageConfigs.id, storage.id))
      .run();
    expect(readUploadPageSettings(db)).toMatchObject({
      defaultStorageId: storage.id,
      storages: [{ id: storage.id, enabled: false }],
    });
  });

  it('returns an empty choice list when no storage is configured', () => {
    fixture.db.update(storageSettings).set({ defaultStorageId: null }).run();
    fixture.db.delete(storageConfigs).run();
    expect(readUploadPageSettings(fixture.db)).toMatchObject({
      defaultStorageId: null,
      storages: [],
    });
  });

  it.each(['upload', 'media', 'storage'] as const)(
    'reports uninitialized %s settings',
    (kind) => {
      const table = {
        upload: uploadSettings,
        media: mediaSettings,
        storage: storageSettings,
      }[kind];
      fixture.db.delete(table).run();
      expect(() => readUploadPageSettings(fixture.db)).toThrowError(
        expect.objectContaining({
          code: 'UPLOAD_NOT_INITIALIZED',
          status: 409,
        }),
      );
    },
  );
});
