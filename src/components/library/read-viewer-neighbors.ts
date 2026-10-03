import { libraryRequestParams } from '../../app/library/query-state';
import type { LibraryFilters } from '../../server/library/query-schema';
import type { LibraryItem } from '../../server/library/types';
import { DetailReadError } from './read-detail';
import type { ViewerNeighbors } from './viewer-model';

export async function readViewerNeighbors(
  imageId: string,
  filters: LibraryFilters,
  signal: AbortSignal,
): Promise<ViewerNeighbors> {
  let response: Response;
  try {
    response = await fetch(
      `/api/images/${encodeURIComponent(imageId)}/neighbors?${libraryRequestParams(filters, {})}`,
      { signal, cache: 'no-store' },
    );
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new Error('连接中断，无法读取相邻图片，请检查网络后重试。', {
      cause,
    });
  }
  if (!response.ok) {
    const result = await response.json();
    throw new DetailReadError(
      `${result.message}（HTTP ${response.status}）`,
      response.status,
    );
  }
  const result: Record<'previous' | 'next', LibraryItem | null> =
    await response.json();
  return {
    previous: result.previous?.id ?? null,
    next: result.next?.id ?? null,
  };
}
