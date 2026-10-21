import {
  collectionListHref,
  readCollectionQuery,
  type CollectionQuery,
} from '../albums/collection-navigation';

export type ShareListQuery = CollectionQuery & { kind: 'album' | 'image' };
export function readShareListQuery(params: URLSearchParams): ShareListQuery {
  const kind = params.get('kind') ?? 'album';
  if (params.getAll('kind').length > 1 || !['album', 'image'].includes(kind))
    throw new Error('分享类型无效，请重置查询后重试。');
  return {
    ...readCollectionQuery(params),
    kind: kind as ShareListQuery['kind'],
  };
}
export function shareListHref(query: ShareListQuery) {
  const href = collectionListHref('/shares', query);
  return query.kind === 'image' ? `${href}&kind=image` : href;
}
