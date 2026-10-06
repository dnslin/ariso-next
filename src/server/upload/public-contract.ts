import { z } from 'zod';
import { tagNameSchema } from '../collections/validation.ts';
import { versionKinds } from '../media/schema.ts';

const idSchema = z.string().min(1).max(255);
const imageStatusSchema = z.enum(['pending', 'processing', 'ready', 'failed']);

/** Repeated multipart fields stay arrays; collections owns normalization and matching. */
export const publicUploadFieldsSchema = z.strictObject({
  storageId: idSchema.optional(),
  albumId: z
    .array(idSchema.regex(/^[^,]+$/, '多个相册 ID 须通过重复 albumId 字段提供'))
    .default([])
    .describe('Repeat albumId for multiple album IDs; IDs are deduplicated.'),
  tag: z
    .array(
      z
        .string()
        .refine((value) => tagNameSchema.safeParse(value).success, {
          message: '标签须包含 1–50 个 Unicode 码点，且不能包含换行或控制字符',
        })
        .describe(
          'A tag name of 1–50 Unicode code points; commas are part of the name.',
        ),
    )
    .default([])
    .describe('Repeat tag for multiple tag names.'),
  visibility: z.enum(['public', 'private']).optional(),
});

/** The documented multipart request shares its field schema with the stream receiver. */
export const publicUploadInputSchema = publicUploadFieldsSchema.extend({
  file: z.file().describe('Exactly one image file; URL input is not accepted.'),
});

export const publicUploadErrorDetailSchema = z.strictObject({
  code: z.string().min(1),
  stage: z.string().min(1),
  message: z.string().min(1),
});

const processingVersionSchema = z.strictObject({
  status: z.enum(['succeeded', 'not_applicable', 'disabled', 'not_generated']),
  reason: z.string().nullable(),
});

const savedVersionSchema = z.strictObject({
  url: z.url(),
  mime: z.string().min(1),
});

export const publicUploadSuccessSchema = z.strictObject({
  imageId: idSchema,
  status: z.literal('ready'),
  currentImageStatus: imageStatusSchema.optional(),
  url: z.url(),
  actualVersion: z.enum(versionKinds).nullable(),
  defaultResolution: z.union([
    z.strictObject({ available: z.literal(true), code: z.null() }),
    z.strictObject({
      available: z.literal(false),
      code: z.literal('VERSION_UNAVAILABLE'),
    }),
  ]),
  versions: z.strictObject({
    original: savedVersionSchema.optional(),
    compressed: savedVersionSchema.optional(),
    thumbnail: savedVersionSchema.optional(),
    watermark: savedVersionSchema.optional(),
  }),
  processing: z.strictObject({
    status: z.literal('succeeded'),
    versions: z.strictObject({
      original: processingVersionSchema,
      compressed: processingVersionSchema,
      thumbnail: processingVersionSchema,
      watermark: processingVersionSchema,
    }),
    warnings: z.array(publicUploadErrorDetailSchema),
  }),
  requestId: idSchema,
});

export const publicUploadErrorSchema = z.strictObject({
  imageId: idSchema.nullable(),
  status: z.enum([
    'not_created',
    'pending',
    'processing',
    'ready',
    'failed',
    'unavailable',
  ]),
  currentImageStatus: imageStatusSchema.optional(),
  error: publicUploadErrorDetailSchema,
  requestId: idSchema,
});

export const publicUploadResponseSchema = z.union([
  publicUploadSuccessSchema,
  publicUploadErrorSchema,
]);

export type PublicUploadFields = z.infer<typeof publicUploadFieldsSchema>;
export type PublicUploadInput = z.infer<typeof publicUploadInputSchema>;
export type PublicUploadErrorDetail = z.infer<
  typeof publicUploadErrorDetailSchema
>;
export type PublicUploadSuccess = z.infer<typeof publicUploadSuccessSchema>;
export type PublicUploadError = z.infer<typeof publicUploadErrorSchema>;
export type PublicUploadResponse = z.infer<typeof publicUploadResponseSchema>;
