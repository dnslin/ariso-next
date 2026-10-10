import { z } from 'zod';

export class LibraryQueryError extends Error {
  constructor(
    message: string,
    readonly code = 'LIBRARY_INVALID_QUERY',
    readonly status = 400,
  ) {
    super(message);
  }
}

const id = z.string().min(1);
const positiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().positive());
const instant = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

/** Shared by HTTP and future filter controls; unknown/scope-inapplicable fields are errors. */
export const libraryQuerySchema = z
  .strictObject({
    scope: z.enum(['normal', 'album', 'trash']).default('normal'),
    q: z
      .string()
      .trim()
      .refine((value) => !value.includes('\0'), '名称搜索不能包含 NUL 字符')
      .default(''),
    albumId: id.optional(),
    tagId: z.array(id).default([]),
    uploadedFrom: instant.optional(),
    uploadedBefore: instant.optional(),
    format: z
      .enum([
        'jpeg',
        'png',
        'gif',
        'webp',
        'avif',
        'heif',
        'tiff',
        'bmp',
        'ico',
        'svg',
      ])
      .optional(),
    storageId: id.optional(),
    visibility: z.enum(['public', 'private']).optional(),
    status: z.enum(['pending', 'processing', 'ready', 'failed']).optional(),
    failure: z.enum(['initial', 'reprocess']).optional(),
    deletionStatus: z.enum(['none', 'deleting', 'cleanup_failed']).optional(),
    sort: z
      .enum(['uploaded_desc', 'uploaded_asc', 'size_desc', 'size_asc'])
      .optional(),
    pageSize: positiveInteger
      .pipe(z.union([z.literal(20), z.literal(40), z.literal(80)]))
      .default(40),
    page: positiveInteger.optional(),
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .superRefine((value, ctx) => {
    const reject = (message: string) =>
      ctx.addIssue({ code: 'custom', message });
    if (value.page !== undefined && value.cursor !== undefined)
      reject('页码与游标不能同时使用');
    if (
      value.page !== undefined &&
      !Number.isSafeInteger((value.page - 1) * value.pageSize)
    )
      reject('页码超出范围');
    if (
      value.uploadedFrom &&
      value.uploadedBefore &&
      Date.parse(value.uploadedFrom) >= Date.parse(value.uploadedBefore)
    )
      reject('上传开始时间必须早于结束时间');
    if (value.scope === 'album' && !value.albumId)
      reject('相册范围需要 albumId');
    if (value.scope !== 'normal' && value.sort !== undefined)
      reject('该范围使用固定顺序');
    if (value.scope !== 'trash' && value.deletionStatus !== undefined)
      reject('删除状态仅用于回收站');
    if (value.scope === 'trash' && value.failure !== undefined)
      reject('当前处理异常仅用于正常图库或相册');
    if (
      value.scope === 'trash' &&
      (value.albumId !== undefined ||
        value.tagId.length > 0 ||
        value.uploadedFrom !== undefined ||
        value.uploadedBefore !== undefined ||
        value.format !== undefined ||
        value.visibility !== undefined)
    )
      reject('回收站不支持这些筛选条件');
  })
  .transform((value) => ({
    filters: {
      scope: value.scope,
      q: value.q,
      albumId: value.albumId ?? null,
      tagIds: [...new Set(value.tagId)].sort(),
      uploadedFrom: value.uploadedFrom ?? null,
      uploadedBefore: value.uploadedBefore ?? null,
      format: value.format ?? null,
      storageId: value.storageId ?? null,
      visibility: value.visibility ?? null,
      status: value.status ?? null,
      failure: value.failure ?? null,
      deletionStatus: value.deletionStatus ?? null,
      sort:
        value.scope === 'album'
          ? ('joined_desc' as const)
          : value.scope === 'trash'
            ? ('trashed_desc' as const)
            : (value.sort ?? 'uploaded_desc'),
      pageSize: value.pageSize,
    },
    page: value.page ?? null,
    encodedCursor: value.cursor ?? null,
  }));

const cursorSchema = z.strictObject({
  query: z.string(),
  value: z.number().int().min(-8640000000000000).max(8640000000000000),
  id,
});
export type LibraryCursor = z.infer<typeof cursorSchema>;
export type LibraryFilters = z.output<typeof libraryQuerySchema>['filters'];
export type LibraryQuery = {
  filters: LibraryFilters;
  page: number | null;
  cursor: LibraryCursor | null;
};

export function parseLibraryQuery(params: URLSearchParams): LibraryQuery {
  const input = Object.fromEntries(
    [...new Set(params.keys())].map((key) => {
      const values = params.getAll(key);
      if (key !== 'tagId' && values.length > 1)
        throw new LibraryQueryError(`查询参数 ${key} 不能重复`);
      return [key, key === 'tagId' ? values : values[0]];
    }),
  );
  const parsed = libraryQuerySchema.safeParse(input);
  if (!parsed.success)
    throw new LibraryQueryError(
      parsed.error.issues.map((issue) => issue.message).join('；'),
    );
  const { filters, page, encodedCursor } = parsed.data;
  let cursor: LibraryCursor | null = null;
  if (encodedCursor !== null) {
    try {
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(encodedCursor, 'base64url').toString('utf8')),
      );
      if (
        cursor.query !== JSON.stringify(filters) ||
        (filters.sort.startsWith('size') && cursor.value < 0)
      )
        throw new Error('Query mismatch');
    } catch {
      throw new LibraryQueryError(
        '加载位置无效或不属于当前查询，请从首批重新加载',
      );
    }
  }
  return { filters, page, cursor };
}

export function encodeLibraryCursor(
  filters: LibraryFilters,
  value: number,
  id: string,
) {
  return Buffer.from(
    JSON.stringify({
      query: JSON.stringify(filters),
      value,
      id,
    } satisfies LibraryCursor),
  ).toString('base64url');
}

export const libraryStatusSchema = z.strictObject({
  ids: z
    .array(id)
    .min(1)
    .max(80)
    .transform((ids) => [...new Set(ids)]),
});
