import { parseDateTime, toZoned } from '@internationalized/date';
import { z } from 'zod';
import { SharingError } from './errors.ts';

export const passwordInputSchema = z
  .string()
  .refine((value) => [...value].length >= 1 && [...value].length <= 128, {
    message: '分享密码须包含 1–128 个 Unicode 码点',
  });

export const unlockInputSchema = z.strictObject({
  password: passwordInputSchema,
});

const publicImageIdSchema = z
  .string()
  .min(1)
  .regex(/^[^/\\\p{Cc}]+$/u);
export const publicShareCursorSchema = publicImageIdSchema.nullable();

export function parsePublicShareCursor(cursor: string | null): string | null {
  const parsed = publicShareCursorSchema.safeParse(cursor);
  if (!parsed.success)
    throw new SharingError('SHARING_INVALID_INPUT', '加载位置参数无效');
  return parsed.data;
}

export function parsePublicShareQuery(params: URLSearchParams): string | null {
  if (
    [...params.keys()].some((key) => key !== 'cursor') ||
    params.getAll('cursor').length > 1
  )
    throw new SharingError(
      'SHARING_INVALID_INPUT',
      '列表仅接受一个加载位置参数',
    );
  return parsePublicShareCursor(params.get('cursor'));
}

export const publicRefreshInputSchema = z.strictObject({
  ids: z
    .array(publicImageIdSchema)
    .max(80)
    .transform((ids) => [...new Set(ids)]),
});

const passwordOperationSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('keep') }),
  z.strictObject({ action: z.literal('set'), value: passwordInputSchema }),
  z.strictObject({ action: z.literal('clear') }),
]);

const configurationFields = {
  password: passwordOperationSchema.optional(),
  // The wire contract is a UTC instant. null explicitly removes the deadline.
  expiresAt: z.iso.datetime().nullable().optional(),
  layout: z.enum(['grid', 'masonry']).optional(),
  showName: z.boolean().optional(),
};

export const createShareInputSchema = z.strictObject(configurationFields);
export const updateShareInputSchema = z
  .strictObject({ ...configurationFields, enabled: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: '请提交需要修改的分享设置',
  });

const localDateTimeSchema = z.iso.datetime({ local: true });

/** Convert a site's local form value to UTC; never silently shift a DST gap. */
export function parseShareExpiry(
  localDateTime: string,
  timeZone: string,
  disambiguation: 'reject' | 'earlier' | 'later' = 'reject',
) {
  try {
    localDateTimeSchema.parse(localDateTime);
    return toZoned(parseDateTime(localDateTime), timeZone, disambiguation)
      .toDate()
      .toISOString();
  } catch {
    throw new SharingError(
      'SHARING_INVALID_INPUT',
      '截止时间无效，夏令时重复或不存在的时间需要明确选择',
    );
  }
}
