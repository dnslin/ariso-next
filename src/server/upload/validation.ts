import { z } from 'zod';
import { UploadError } from './errors.ts';

export function normalizeOriginalName(value: string) {
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(value))
    throw new UploadError('UPLOAD_INVALID_NAME', '文件名不能包含控制字符');
  const name = value.split(/[\\/]/u).at(-1) ?? '';
  if ([...name].length > 255)
    throw new UploadError('UPLOAD_INVALID_NAME', '文件名不能超过 255 个字符');
  return name === '' || name === '.' || name === '..' ? 'image' : name;
}

const id = z.string().min(1).max(255);
export const submissionInputSchema = z
  .strictObject({
    requestId: id,
    files: z
      .array(
        z.strictObject({
          queueItemId: id,
          originalName: z.string(),
          declaredSize: z
            .number()
            .int()
            .positive()
            .max(Number.MAX_SAFE_INTEGER),
          declaredMime: z.string().max(255).optional(),
        }),
      )
      .length(1),
    storageId: id.optional(),
    visibility: z.enum(['public', 'private']).optional(),
    albumIds: z.array(id).default([]),
    tagIds: z.array(id).default([]),
  })
  .superRefine((input, ctx) => {
    if (
      new Set(input.files.map((f) => f.queueItemId)).size !== input.files.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['files'],
        message: '队列项 ID 不可重复',
      });
  });
export type SubmissionInput = z.input<typeof submissionInputSchema>;
