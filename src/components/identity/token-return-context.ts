import type { QueryClient } from '@tanstack/react-query';

export const tokenReturnScrollKey = ['upload-token-return-scroll'] as const;

/** Only retain the scroll position until the Token page consumes it. */
export function rememberTokenReturnScroll(
  client: QueryClient,
  scrollTop: number,
) {
  client.setQueryDefaults(tokenReturnScrollKey, { gcTime: Infinity });
  client.setQueryData(tokenReturnScrollKey, scrollTop);
}
