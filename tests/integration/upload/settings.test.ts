import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  patchUploadSettings,
  requireUploadSettings,
} from '../../../src/server/upload/settings.ts';
import { uploadSettings } from '../../../src/server/upload/schema.ts';
import { UPLOAD_MAX_FILE_MIB } from '../../../src/shared/upload-settings.ts';
import { collectionFixture } from '../collections/helpers.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => fixture.close());

describe('upload limits settings', () => {
  it('returns Chinese field errors that the settings form can bind without exposing Zod internals', () => {
    expect(() =>
      patchUploadSettings(fixture.db, {
        maxFileMiB: 1.5,
        batchSize: 0,
        queueLimit: 2001,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'UPLOAD_SETTINGS_INVALID',
        status: 422,
        message: '请检查上传限制字段',
        fields: [
          { field: 'maxFileMiB', message: '请输入正整数 MiB' },
          { field: 'batchSize', message: '请输入 1–200 的整数' },
          { field: 'queueLimit', message: '请输入 100–2000 的整数' },
        ],
      }),
    );
  });

  it('reads migration defaults and saves integer MiB as the same byte limit used by upload', () => {
    expect(requireUploadSettings(fixture.db)).toEqual({
      maxFileMiB: 50,
      maxFileBytes: 50 * 1024 * 1024,
      batchSize: 20,
      queueLimit: 500,
    });
    expect(patchUploadSettings(fixture.db, { maxFileMiB: 2048 })).toEqual({
      maxFileMiB: 2048,
      maxFileBytes: 2048 * 1024 * 1024,
      batchSize: 20,
      queueLimit: 500,
    });
    expect(fixture.db.select().from(uploadSettings).get()?.maxFileBytes).toBe(
      2048 * 1024 * 1024,
    );
  });

  it.each([
    { maxFileMiB: 1 },
    { maxFileMiB: UPLOAD_MAX_FILE_MIB },
    { batchSize: 1, queueLimit: 100 },
    { batchSize: 200, queueLimit: 2000 },
    { batchSize: 100, queueLimit: 100 },
  ])('accepts the configured boundary %j', (input) => {
    expect(patchUploadSettings(fixture.db, input)).toMatchObject(input);
  });

  it.each([
    { maxFileMiB: 0 },
    { maxFileMiB: -1 },
    { maxFileMiB: 1.5 },
    { maxFileMiB: '50' },
    { maxFileMiB: Number.MAX_SAFE_INTEGER },
    { maxFileMiB: UPLOAD_MAX_FILE_MIB + 1 },
    { batchSize: 0 },
    { batchSize: 201 },
    { batchSize: 1.5 },
    { queueLimit: 99 },
    { queueLimit: 2001 },
    { queueLimit: 100.5 },
    { batchSize: 101, queueLimit: 100 },
    { maxFileBytes: 1024 },
    null,
    [],
  ])('rejects invalid settings %j without changing saved limits', (input) => {
    const before = fixture.db.select().from(uploadSettings).get();
    expect(() => patchUploadSettings(fixture.db, input)).toThrowError(
      expect.objectContaining({ code: 'UPLOAD_SETTINGS_INVALID', status: 422 }),
    );
    expect(fixture.db.select().from(uploadSettings).get()).toEqual(before);
  });

  it('checks the resulting batch/queue combination when only one limit is patched', () => {
    patchUploadSettings(fixture.db, { batchSize: 150 });
    expect(() =>
      patchUploadSettings(fixture.db, { queueLimit: 100 }),
    ).toThrowError(
      expect.objectContaining({
        code: 'UPLOAD_SETTINGS_INVALID',
        status: 422,
        fields: [{ field: 'batchSize', message: '批次大小不能超过队列上限' }],
      }),
    );
    expect(requireUploadSettings(fixture.db)).toMatchObject({
      batchSize: 150,
      queueLimit: 500,
    });
  });

  it('does not initialize missing settings through either read or write', () => {
    fixture.db.delete(uploadSettings).run();
    for (const operation of [
      () => requireUploadSettings(fixture.db),
      () => patchUploadSettings(fixture.db, { batchSize: 10 }),
    ])
      expect(operation).toThrowError(
        expect.objectContaining({
          code: 'UPLOAD_NOT_INITIALIZED',
          status: 409,
        }),
      );
    expect(fixture.db.select().from(uploadSettings).all()).toEqual([]);
  });
});
