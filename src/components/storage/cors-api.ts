import type { readStorage } from '../../server/storage/settings.ts';

export type CorsStorage = Pick<
  ReturnType<typeof readStorage>,
  | 'id'
  | 'name'
  | 'type'
  | 'configRevision'
  | 'enabled'
  | 'connectionStatus'
  | 'connectionRevision'
>;

export class CorsRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function corsRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new CorsRequestError(
      body?.message ?? `检测请求失败（HTTP ${response.status}）`,
      response.status,
    );
  }
  return response.json();
}

export const corsUrl = (id: string) =>
  `/api/storages/${encodeURIComponent(id)}/cors-tests`;
