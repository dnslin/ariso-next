import { expect, it } from 'vitest';
import {
  createShareLimiter,
  ShareRateLimitError,
} from '../../../src/server/sharing/limiter.ts';

it('enforces twenty attempts per share and resets exactly at one minute', () => {
  const limiter = createShareLimiter();
  for (let i = 0; i < 20; i++) limiter.acquire('a', 1000)();
  expect(() => limiter.acquire('a', 1000)).toThrow(ShareRateLimitError);
  try {
    limiter.acquire('a', 60000);
  } catch (err) {
    expect((err as ShareRateLimitError).retryAfter).toBe(1);
  }
  limiter.acquire('b', 1000)();
  limiter.acquire('a', 61000)();
});

it('limits the whole process to two hashes and releases capacity', () => {
  const limiter = createShareLimiter();
  const first = limiter.acquire('a', 0);
  const second = limiter.acquire('b', 0);
  expect(() => limiter.acquire('c', 0)).toThrow(ShareRateLimitError);
  first();
  limiter.acquire('c', 0)();
  second();
});

it('bounds distinct share counters without discarding live limits; idle entries expire', () => {
  const limiter = createShareLimiter();
  for (let i = 0; i < 10000; i++) limiter.acquire(String(i), 0)();
  expect(() => limiter.acquire('overflow', 0)).toThrow(ShareRateLimitError);
  limiter.prune(60000);
  limiter.acquire('overflow', 60000)();
});
