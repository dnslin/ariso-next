import type { listTags } from '../../server/collections/tag-management';

export type TagPage = ReturnType<typeof listTags>;
export type Tag = TagPage['items'][number];
export class TagRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function tagRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new TagRequestError(
      body?.message ?? `标签请求失败（HTTP ${response.status}）`,
      response.status,
    );
  }
  return response.json();
}
export const tagUrl = (id: string) => `/api/tags/${encodeURIComponent(id)}`;
