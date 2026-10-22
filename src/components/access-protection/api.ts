import type { AccessProtectionSettingsResponse } from '../../server/access-protection/types';

export const accessProtectionUrl = '/api/settings/access-protection';
export const accessProtectionQueryKey = ['access-protection'] as const;
export class AccessProtectionRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly fields: { field: string; message: string }[] = [],
  ) {
    super(message);
  }
}

export async function accessProtectionRequest(
  init?: RequestInit,
): Promise<AccessProtectionSettingsResponse> {
  const response = await fetch(accessProtectionUrl, {
    cache: 'no-store',
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new AccessProtectionRequestError(
      response.status,
      body?.code,
      body?.message ?? `访问防护请求失败（HTTP ${response.status}）`,
      body?.fields,
    );
  }
  return response.json();
}
