import type { ImageSizeInput } from '../../server/media/size-types';
import type { ImageSizeResponse } from '../../server/delivery/size-types';

export class SizeRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function requestSizeState(
  imageId: string,
  input: ImageSizeInput,
  method: 'GET' | 'POST',
  signal: AbortSignal,
): Promise<ImageSizeResponse> {
  const path = `/api/images/${encodeURIComponent(imageId)}/sizes`;
  const query = new URLSearchParams({
    version: input.version,
    preset: input.preset,
  });
  const response = await fetch(method === 'GET' ? `${path}?${query}` : path, {
    method,
    signal,
    cache: 'no-store',
    ...(method === 'POST'
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      : {}),
  });
  let body: (ImageSizeResponse & { message?: string }) | null;
  try {
    body = await response.json();
  } catch {
    throw new SizeRequestError(
      `尺寸响应无法读取（HTTP ${response.status}）`,
      response.status,
    );
  }
  if (!response.ok || !body)
    throw new SizeRequestError(
      body?.message ?? `尺寸请求失败（HTTP ${response.status}）`,
      response.status,
    );
  return body;
}
