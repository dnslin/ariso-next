import { z } from 'zod';
import { normalizeUploadName } from '../../shared/upload-name.ts';
import { UploadError } from './errors.ts';

export function normalizeOriginalName(value: string) {
  try {
    return normalizeUploadName(value);
  } catch (error) {
    throw new UploadError('UPLOAD_INVALID_NAME', (error as Error).message);
  }
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
      .min(1),
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
