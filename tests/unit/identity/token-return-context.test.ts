import { afterEach, expect, it, vi } from 'vitest';
import { environmentManager, QueryClient } from '@tanstack/react-query';
import {
  rememberTokenReturnScroll,
  tokenReturnScrollKey,
} from '../../../src/components/identity/token-return-context';

afterEach(() => {
  environmentManager.setIsServer(() => true);
  vi.useRealTimers();
});

it('retains only the return scroll number while usage is read longer than five minutes, then releases it on return', () => {
  vi.useFakeTimers();
  environmentManager.setIsServer(() => false);
  const client = new QueryClient();
  try {
    rememberTokenReturnScroll(client, 217);
    vi.advanceTimersByTime(6 * 60 * 1000);
    expect(client.getQueryData(tokenReturnScrollKey)).toBe(217);
    client.removeQueries({ queryKey: tokenReturnScrollKey, exact: true });
    expect(client.getQueryData(tokenReturnScrollKey)).toBeUndefined();
  } finally {
    client.clear();
  }
});
