import {
  LibraryQueryError,
  libraryQuerySchema,
  type LibraryFilters,
} from '../../server/library/query-schema';

export type LibraryLayout = 'grid' | 'masonry';
export type LibraryLoadingMode = 'more' | 'pages';
export type LibraryQueryPatch = {
  q?: string | null;
  albumId?: string | null;
  tagId?: string[] | null;
  tagState?: 'none' | null;
  sizeGreaterThan?: string | null;
  sizeLessThan?: string | null;
  recentDays?: string | null;
  relativeTo?: string | null;
  uploadedFrom?: string | null;
  uploadedBefore?: string | null;
  format?: LibraryFilters['format'];
  storageId?: string | null;
  visibility?: LibraryFilters['visibility'];
  status?: LibraryFilters['status'];
  failure?: LibraryFilters['failure'];
  sort?: 'uploaded_desc' | 'uploaded_asc' | 'size_desc' | 'size_asc' | null;
  pageSize?: 20 | 40 | 80;
};

/** Read raw URL values so an invalid value is never replaced by a parser default. */
export function parseLibraryLocation(
  params: URLSearchParams,
  fixedAlbumId?: string,
) {
  const input: Record<string, unknown> = Object.create(null);
  for (const key of new Set(params.keys())) {
    if (
      key === 'image' ||
      key === 'detailView' ||
      key === 'preview' ||
      key === 'imageEdit' ||
      key === 'analyticsReturn' ||
      key === 'storageReturn' ||
      (fixedAlbumId && key === 'returnTo')
    )
      continue;
    const values = params.getAll(key);
    if (key !== 'tagId' && values.length > 1)
      throw new LibraryQueryError(`查询参数 ${key} 不能重复`);
    input[key] = key === 'tagId' ? values : values[0];
  }
  if (input.cursor !== undefined)
    throw new LibraryQueryError('页面链接不保存加载位置，请重置后从首批加载');
  const scope = fixedAlbumId ? 'album' : 'normal';
  if (input.scope !== undefined && input.scope !== scope)
    throw new LibraryQueryError('查询范围与当前页面不一致');
  input.scope = scope;
  if (fixedAlbumId) {
    if (input.albumId !== undefined && input.albumId !== fixedAlbumId)
      throw new LibraryQueryError('相册筛选与当前相册不一致');
    input.albumId = fixedAlbumId;
  }
  const result = libraryQuerySchema.safeParse(input);
  if (!result.success)
    throw new LibraryQueryError(
      result.error.issues.map((issue) => issue.message).join('；'),
    );
  return { filters: result.data.filters, page: result.data.page ?? 1 };
}

export { libraryRequestParams } from '../../server/library/query-params';

export function libraryListKey(
  filters: LibraryFilters | null,
  mode: LibraryLoadingMode,
  page: number,
) {
  return ['library', mode, filters, mode === 'pages' ? page : null] as const;
}
