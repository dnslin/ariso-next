import type { UploadItem, UploadRelation } from './types';

export type UploadDraft = {
  storageId?: string;
  visibility?: 'public' | 'private';
  albums?: UploadRelation[];
  tags?: UploadRelation[];
};

export const uploadDraftKey = (albumId?: string) =>
  albumId ? `album:${albumId}` : undefined;

export function uploadContextItems(
  items: readonly UploadItem[],
  albumId?: string,
) {
  const key = uploadDraftKey(albumId);
  return items.filter((item) =>
    item.state === 'queued'
      ? item.draftKey === key
      : !albumId ||
        item.draftKey === key ||
        item.targetAlbumIds?.includes(albumId) ||
        item.frozenSubmission?.albums.some((album) => album.id === albumId),
  );
}

export function readUploadContext(
  params: Record<string, string | string[] | undefined>,
) {
  const albumId =
    typeof params.albumId === 'string' ? params.albumId : undefined;
  if (!albumId) return {};
  const albumPath = `/albums/${encodeURIComponent(albumId)}`;
  const target =
    typeof params.returnTo === 'string' ? params.returnTo : albumPath;
  const url = URL.canParse(target, 'http://ariso.internal')
    ? new URL(target, 'http://ariso.internal')
    : null;
  const returnTo =
    url?.origin === 'http://ariso.internal' && url.pathname === albumPath
      ? `${url.pathname}${url.search}${url.hash}`
      : albumPath;
  return { albumId, returnTo };
}

export function albumUploadHref(albumId: string, returnTo: string) {
  return `/upload?${new URLSearchParams({ albumId, returnTo })}`;
}
