import { z } from 'zod';

export const UPLOAD_MIB_BYTES = 1024 * 1024;
export const UPLOAD_MAX_FILE_MIB = Math.floor(
  Number.MAX_SAFE_INTEGER / UPLOAD_MIB_BYTES,
);

const settingsFieldsSchema = z.strictObject(
  {
    maxFileMiB: z
      .int('请输入正整数 MiB')
      .min(1, '请输入正整数 MiB')
      .max(UPLOAD_MAX_FILE_MIB, '文件大小换算为字节后超出可保存范围'),
    batchSize: z
      .int('请输入 1–200 的整数')
      .min(1, '请输入 1–200 的整数')
      .max(200, '请输入 1–200 的整数'),
    queueLimit: z
      .int('请输入 100–2000 的整数')
      .min(100, '请输入 100–2000 的整数')
      .max(2000, '请输入 100–2000 的整数'),
  },
  { error: '请提供上传限制字段' },
);

/** PATCH validates provided fields first, then the complete saved combination. */
export const uploadSettingsPatchSchema = settingsFieldsSchema.partial();
export const uploadSettingsInputSchema = settingsFieldsSchema.refine(
  (settings) => settings.batchSize <= settings.queueLimit,
  { path: ['batchSize'], message: '批次大小不能超过队列上限' },
);
export type UploadSettingsInput = z.infer<typeof uploadSettingsInputSchema>;
export type UploadSettingsFieldError = { field: string; message: string };

export function uploadSettingsFieldErrors(error: z.ZodError) {
  const seen = new Set<string>();
  return error.issues
    .flatMap((issue): UploadSettingsFieldError[] =>
      issue.code === 'unrecognized_keys'
        ? issue.keys.map((field) => ({ field, message: '未知字段' }))
        : [{ field: issue.path.join('.'), message: issue.message }],
    )
    .filter(({ field }) => {
      if (seen.has(field)) return false;
      seen.add(field);
      return true;
    });
}
