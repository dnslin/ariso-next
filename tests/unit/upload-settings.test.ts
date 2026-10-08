import { describe, expect, it } from 'vitest';
import {
  UPLOAD_MAX_FILE_MIB,
  UPLOAD_MIB_BYTES,
  uploadSettingsFieldErrors,
  uploadSettingsInputSchema,
  uploadSettingsPatchSchema,
} from '../../src/shared/upload-settings.ts';

const settings = { maxFileMiB: 50, batchSize: 20, queueLimit: 500 };

describe('shared upload settings contract', () => {
  it('accepts full form values and strict partial provider writes', () => {
    expect(uploadSettingsInputSchema.parse(settings)).toEqual(settings);
    expect(uploadSettingsPatchSchema.parse({ batchSize: 200 })).toEqual({
      batchSize: 200,
    });
    expect(
      uploadSettingsInputSchema.safeParse({ batchSize: 200 }).success,
    ).toBe(false);
    expect(
      uploadSettingsPatchSchema.safeParse({ maxFileBytes: 1024 }).success,
    ).toBe(false);
  });

  it('binds a complete invalid batch/queue combination to the batch field', () => {
    const parsed = uploadSettingsInputSchema.safeParse({
      ...settings,
      batchSize: 101,
      queueLimit: 100,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(uploadSettingsFieldErrors(parsed.error)).toEqual([
        { field: 'batchSize', message: '批次大小不能超过队列上限' },
      ]);
  });

  it('keeps field range errors ahead of a later batch/queue relationship error', () => {
    const parsed = uploadSettingsInputSchema.safeParse({
      maxFileMiB: 0,
      batchSize: 201,
      queueLimit: 99,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(uploadSettingsFieldErrors(parsed.error)).toEqual([
        { field: 'maxFileMiB', message: '请输入正整数 MiB' },
        { field: 'batchSize', message: '请输入 1–200 的整数' },
        { field: 'queueLimit', message: '请输入 100–2000 的整数' },
      ]);
  });

  it('keeps the maximum integer MiB within an exactly representable byte limit', () => {
    const accepted = uploadSettingsInputSchema.parse({
      ...settings,
      maxFileMiB: UPLOAD_MAX_FILE_MIB,
    });
    expect(Number.isSafeInteger(accepted.maxFileMiB * UPLOAD_MIB_BYTES)).toBe(
      true,
    );
    expect(
      uploadSettingsInputSchema.safeParse({
        ...settings,
        maxFileMiB: UPLOAD_MAX_FILE_MIB + 1,
      }).success,
    ).toBe(false);
  });
});
