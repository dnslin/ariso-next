import type {
  BatchCommand,
  BatchItemResult,
} from '../../server/library/batch-types';

export class BatchRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Each request uses the same explicit snapshot; an unknown response stops unsent work. */
export async function requestBatch(
  ids: string[],
  query: string,
  command: BatchCommand,
  mode: 'apply' | 'check',
  signal: AbortSignal,
  onResults: (results: BatchItemResult[]) => void,
) {
  for (let offset = 0; offset < ids.length; offset += 200) {
    signal.throwIfAborted();
    const chunk = ids.slice(offset, offset + 200);
    try {
      const response = await fetch('/api/images/batch', {
        method: 'POST',
        signal,
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: chunk, query, command, mode }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new BatchRequestError(body.message, response.status);
      onResults(body.results);
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof BatchRequestError && error.status < 500) throw error;
      return {
        unknownIds: chunk,
        unsentIds: ids.slice(offset + 200),
        message:
          mode === 'apply'
            ? '连接中断或服务器未能返回完整结果，请先核对实际状态。尚未发送的图片没有自动提交。'
            : '暂时无法核对结果，请检查连接后重新核对。',
      };
    }
    // Yield before the next bounded request, without starting a background job.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return { unknownIds: [], unsentIds: [], message: '' };
}
