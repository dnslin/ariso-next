import {
  LibraryQueryError,
  parseLibraryQuery,
  type LibraryFilters,
} from '../../server/library/query-schema';

export type TrashQueryPatch = Pick<
  LibraryFilters,
  'q' | 'storageId' | 'status' | 'deletionStatus' | 'pageSize'
>;

export function parseTrashLocation(params: URLSearchParams) {
  const query = new URLSearchParams(params);
  query.delete('image');
  query.delete('analyticsReturn');
  if (
    query.getAll('scope').length > 1 ||
    (query.has('scope') && query.get('scope') !== 'trash')
  )
    throw new LibraryQueryError('查询范围与回收站不一致');
  if (query.has('cursor'))
    throw new LibraryQueryError('回收站使用页码，请重置查询');
  query.set('scope', 'trash');
  try {
    const result = parseLibraryQuery(query);
    return { filters: result.filters, page: result.page ?? 1 };
  } catch (cause) {
    throw new Error('回收查询参数无效，请重置查询', { cause });
  }
}
