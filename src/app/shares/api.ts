import type { readOwnerShare } from '../../server/sharing/configuration';

export type Share = NonNullable<ReturnType<typeof readOwnerShare>>;
export class ShareRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function shareUrl(albumId: string) {
  return `/api/albums/${encodeURIComponent(albumId)}/share`;
}
export async function shareRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ShareRequestError(
      response.status,
      body?.message ?? `请求失败（HTTP ${response.status}）`,
    );
  }
  return response.json();
}
