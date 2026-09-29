import { isAbsolute, normalize, sep } from 'node:path';
import { z } from 'zod';

const name = z.string().trim().min(1).max(200);
const secret = z
  .string()
  .min(1)
  .refine(
    (value) => !/^(?:\*+|•+|<redacted>|\[redacted\])$/i.test(value),
    '请输入真实凭据，不能提交脱敏占位值',
  );
export const localPathSchema = z
  .string()
  .min(1)
  .refine((value) => {
    const path = normalize(value);
    return (
      !value.includes('\0') &&
      !isAbsolute(value) &&
      path !== '..' &&
      !path.startsWith(`..${sep}`)
    );
  }, '请输入存储根目录内的相对路径');
export const s3EndpointSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    try {
      const url = new URL(value);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        /[?#]/.test(value) ||
        value.includes('\\')
      )
        throw new Error();
      return url.href.replace(/\/$/, '');
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: '请输入不含凭据、查询或片段的 HTTP(S) S3 API 地址',
      });
      return z.NEVER;
    }
  });
// Current longest generated key: media/objects.ts compressed candidate with .partial.
// Include the storage namespace and three UUIDs; s3.ts also checks every final Key.
const objectKeyBudget = Buffer.byteLength(
  `/ariso/${'x'.repeat(36)}/images/${'x'.repeat(36)}/compressed/${'x'.repeat(36)}.partial`,
);
export const s3PathPrefixSchema = z
  .string()
  .transform((value) => value.replace(/^\/+|\/+$/g, ''))
  .refine(
    (value) =>
      !/[\x00-\x1f\x7f\\]/.test(value) &&
      (!value ||
        value
          .split('/')
          .every((part) => part && part !== '.' && part !== '..')) &&
      Buffer.byteLength(value) <= 1024 - objectKeyBudget,
    '请输入有效的对象路径前缀（须为图片对象名称保留空间）',
  );
export const storageCreateInputSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('local'),
    name,
    localPath: localPathSchema,
    enabled: z.boolean().default(true),
  }),
  z.strictObject({
    type: z.literal('s3'),
    name,
    endpoint: s3EndpointSchema,
    region: z.string().trim().min(1),
    bucket: z
      .string()
      .trim()
      .min(1)
      .refine((value) => !/[\/\\\x00-\x1f\x7f]/.test(value)),
    pathPrefix: s3PathPrefixSchema.default(''),
    forcePathStyle: z.boolean().default(false),
    accessKey: secret.nullable().optional(),
    secretKey: secret.nullable().optional(),
    enabled: z.literal(false).default(false),
  }),
]);
export const storageUpdateInputSchema = z
  .strictObject({
    name: name.optional(),
    enabled: z.boolean().optional(),
    accessKey: secret.nullable().optional(),
    secretKey: secret.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '请提供要更新的字段');
export const storageDefaultInputSchema = z.strictObject({
  defaultStorageId: z.string().min(1).nullable(),
});
export type StorageCreateInput = z.output<typeof storageCreateInputSchema>;
export type StorageUpdateInput = z.output<typeof storageUpdateInputSchema>;
