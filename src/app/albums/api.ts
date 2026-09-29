import type { listAlbums } from '../../server/collections/album-management';

export type AlbumPage = ReturnType<typeof listAlbums>;
export type Album = AlbumPage['items'][number];

export class AlbumRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function albumRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new AlbumRequestError(
      body?.message ?? `相册请求失败（HTTP ${response.status}）`,
      response.status,
    );
  }
  return response.json();
}

export const albumUrl = (id: string) => `/api/albums/${encodeURIComponent(id)}`;
