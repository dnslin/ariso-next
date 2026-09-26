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
  return response.json();
}
