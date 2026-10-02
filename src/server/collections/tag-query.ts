import { caseFold } from 'unicode-case-folding';
import { z } from 'zod';
import { CollectionError } from './errors.ts';

const querySchema = z.object({
  q: z
    .string()
    .transform((value) =>
      caseFold(value.trim().normalize('NFC')).normalize('NFC'),
    )
    .default(''),
  page: z.coerce
    .number()
    .int()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER / 80)
    .default(1),
  pageSize: z.coerce
    .number()
    .pipe(z.union([z.literal(20), z.literal(40), z.literal(80)]))
    .default(40),
});

export function parseTagQuery(params: URLSearchParams) {
  if (
    [...params.keys()].some(
      (key) =>
        !['q', 'page', 'pageSize'].includes(key) ||
        params.getAll(key).length > 1,
    )
  )
    throw new CollectionError('COLLECTION_INVALID_INPUT', '标签查询参数无效');
  const parsed = querySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success)
    throw new CollectionError('COLLECTION_INVALID_INPUT', '标签查询参数无效');
  return parsed.data;
}
