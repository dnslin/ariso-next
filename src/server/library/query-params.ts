import type { LibraryFilters } from './query-schema.ts';

export function libraryRequestParams(
  filters: LibraryFilters,
  position: { page?: number; cursor?: string | null },
) {
  const params = new URLSearchParams({
    scope: filters.scope,
    pageSize: String(filters.pageSize),
  });
  for (const key of [
    'q',
    'tagState',
    'sizeGreaterThan',
    'sizeLessThan',
    'recentDays',
    'relativeTo',
    'albumId',
    'uploadedFrom',
    'uploadedBefore',
    'format',
    'storageId',
    'visibility',
    'status',
    'failure',
    'deletionStatus',
  ] as const) {
    const value = filters[key];
    if (key === 'uploadedFrom' && filters.recentDays !== undefined) continue;
    if (value !== null && value !== undefined && value !== '')
      params.set(key, String(value));
  }
  for (const id of filters.tagIds) params.append('tagId', id);
  if (filters.scope === 'normal') params.set('sort', filters.sort);
  if (position.page !== undefined) params.set('page', String(position.page));
  if (position.cursor) params.set('cursor', position.cursor);
  return params;
}
