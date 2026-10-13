export type CollectionPath = '/albums' | '/shares';
export type CollectionQuery = { q: string; page: number; pageSize: number };

export function readCollectionQuery(params: URLSearchParams): CollectionQuery {
  const page = Number(params.get('page') ?? 1);
  const pageSize = Number(params.get('pageSize') ?? 40);
  if (
    ['q', 'page', 'pageSize'].some((key) => params.getAll(key).length > 1) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > Number.MAX_SAFE_INTEGER / 80 ||
    ![20, 40, 80].includes(pageSize)
  )
    throw new Error('列表查询参数无效，请重置搜索和分页后重试。');
  return { q: params.get('q') ?? '', page, pageSize };
}

export function collectionListHref(
  path: CollectionPath,
  query: CollectionQuery,
) {
  const params = new URLSearchParams({
    ...(query.q ? { q: query.q } : {}),
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  return `${path}?${params}`;
}

export const collectionDetailHref = (albumId: string, returnTo: string) =>
  `/albums/${encodeURIComponent(albumId)}?${new URLSearchParams({ returnTo })}`;

export const shareSettingsHref = (albumId: string, returnTo: string) =>
  `/shares/${encodeURIComponent(albumId)}?${new URLSearchParams({ returnTo })}`;

/** Image dialogs own their local scroll/focus; keep one cross-page album source. */
export function collectionReturnIdentity(href: string) {
  const url = new URL(href, 'http://ariso.internal');
  if (url.pathname.startsWith('/albums/'))
    for (const key of ['image', 'detailView', 'preview'])
      url.searchParams.delete(key);
  return `${url.pathname}${url.search}`;
}

/** Only the two lists and this album's detail are destinations of this flow. */
export function readCollectionReturn(
  value: string | null | undefined,
  albumId: string,
  fallback: CollectionPath,
) {
  if (!value || !URL.canParse(value, 'http://ariso.internal')) return fallback;
  const url = new URL(value, 'http://ariso.internal');
  return url.origin === 'http://ariso.internal' &&
    ['/albums', '/shares', `/albums/${encodeURIComponent(albumId)}`].includes(
      url.pathname,
    )
    ? `${url.pathname}${url.search}`
    : fallback;
}
