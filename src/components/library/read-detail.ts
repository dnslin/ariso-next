import type { LibraryDetail as Detail } from '../../server/library/detail-types';

export class DetailReadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function readDetail(
  imageId: string,
  signal: AbortSignal,
  albumId?: string,
): Promise<Detail> {
  let response: Response;
  try {
    response = await fetch(`/api/images/${encodeURIComponent(imageId)}`, {
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('连接中断，无法读取图片详情，请检查网络后重试。', {
      cause: error,
    });
  }
  if (!response.ok) {
    const result = await response.json();
    throw new DetailReadError(
      `${result.message}（HTTP ${response.status}）`,
      response.status,
    );
  }
  const detail: Detail = await response.json();
  if (albumId && !detail.albums.some((album) => album.id === albumId))
    throw new DetailReadError(
      '这张图片已不在当前相册，可返回相册或前往图库查看。',
      404,
    );
  return detail;
}

export function detailQueryOptions(imageId: string | null, albumId?: string) {
  return {
    queryKey: ['library-detail', imageId, albumId],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      readDetail(imageId!, signal, albumId),
    enabled: imageId !== null,
    retry: false,
    networkMode: 'always' as const,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  };
}
