import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { MediaTransaction } from './images.ts';
import { mediaImages } from './schema.ts';

export const imageFieldsSchema = z
  .strictObject({
    displayName: z
      .string()
      .refine((value) => !/[\p{Cc}\u2028\u2029]/u.test(value), {
        message: '显示名称不能包含换行或控制字符',
      })
      .transform((value) => value.trim())
      .refine((value) => [...value].length >= 1 && [...value].length <= 255, {
        message: '显示名称须包含 1–255 个 Unicode 码点',
      })
      .optional(),
    visibility: z.enum(['public', 'private']).optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined || value.visibility !== undefined,
    { message: '至少提供一个图片资料字段' },
  );

export class MediaImageFieldsError extends Error {
  readonly code: string;
  readonly status: 404 | 409;

  constructor(code: string, status: 404 | 409, message: string) {
    super(message);
    this.name = 'MediaImageFieldsError';
    this.code = code;
    this.status = status;
  }
}

/** Only asset fields change. No object, original name, ID or processing task is rewritten. */
export function updateImageFields(
  tx: MediaTransaction,
  imageId: string,
  input: unknown,
) {
  const patch = imageFieldsSchema.parse(input);
  const image = tx
    .select()
    .from(mediaImages)
    .where(eq(mediaImages.id, imageId))
    .get();
  if (!image)
    throw new MediaImageFieldsError(
      'MEDIA_IMAGE_NOT_FOUND',
      404,
      `图片不存在：${imageId}`,
    );
  if (image.trashedAt || image.deletionStatus)
    throw new MediaImageFieldsError(
      'MEDIA_IMAGE_UNAVAILABLE',
      409,
      '回收或正在永久删除的图片仅允许读取资料',
    );
  const changed =
    (patch.displayName !== undefined &&
      patch.displayName !== image.displayName) ||
    (patch.visibility !== undefined && patch.visibility !== image.visibility);
  if (changed)
    tx.update(mediaImages)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(mediaImages.id, imageId))
      .run();
  return { changed };
}
