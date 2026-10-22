import { expect, it } from 'vitest';
import { createAccessLimiter } from '../../../src/server/access-protection/limiter.ts';

const policy = { rate: 10, burst: 200 };

it('allows a full 200-request burst and restores one request after 100 milliseconds', () => {
  const limiter = createAccessLimiter(policy);
  for (let i = 0; i < 200; i++)
    expect(limiter.take('192.0.2.1', 0).allowed).toBe(true);
  expect(limiter.take('192.0.2.1', 0).allowed).toBe(false);
  for (let i = 1; i < 100; i++)
    expect(limiter.take('192.0.2.1', i).allowed).toBe(false);
  expect(limiter.take('192.0.2.1', 100).allowed).toBe(true);
  expect(limiter.take('192.0.2.1', 100).allowed).toBe(false);
});

it('keeps different source addresses independent', () => {
  const limiter = createAccessLimiter({ rate: 10, burst: 1 });
  expect(limiter.take('192.0.2.1', 0).allowed).toBe(true);
  expect(limiter.take('192.0.2.1', 0).allowed).toBe(false);
  expect(limiter.take('192.0.2.2', 0).allowed).toBe(true);
});

it('admits four simultaneous album first screens and two embedded-image tabs', () => {
  const limiter = createAccessLimiter(policy);
  for (let i = 0; i < 4 * 41; i++)
    expect(limiter.take('album-network', 0).allowed).toBe(true);
  for (let i = 0; i < 2 * 80; i++)
    expect(limiter.take('blog-network', 0).allowed).toBe(true);
});

it('admits normal scrolling and viewer preloading while rejecting sustained excess', () => {
  const browsing = createAccessLimiter(policy);
  for (let page = 0; page < 5; page++)
    for (let image = 0; image < 40; image++)
      expect(browsing.take('reader', page * 12_000).allowed).toBe(true);
  for (let image = 0; image < 20; image++)
    for (let preload = 0; preload < 3; preload++)
      expect(browsing.take('reader', 60_000 + image * 1000).allowed).toBe(true);

  const excess = createAccessLimiter(policy);
  let accepted = 0;
  for (let request = 0; request < 1200; request++)
    accepted += Number(excess.take('script', request * 50).allowed);
  expect(accepted).toBeGreaterThanOrEqual(798);
  expect(accepted).toBeLessThanOrEqual(800);
});

it('pruning idle entries never refills a still-active depleted bucket', () => {
  const limiter = createAccessLimiter({ rate: 1, burst: 2 });
  limiter.take('active', 0);
  limiter.take('active', 0);
  limiter.take('idle', -3000);
  limiter.prune(500);
  expect(limiter.take('active', 500).allowed).toBe(false);
  expect(limiter.take('active', 1000).allowed).toBe(true);
  limiter.prune(3000);
  expect(limiter.take('active', 3000).allowed).toBe(true);
  expect(limiter.take('active', 3000).allowed).toBe(true);
});

it('reports the first excess request and samples persistent excess once per 30 seconds', () => {
  const limiter = createAccessLimiter({ rate: 1, burst: 1 });
  limiter.take('script', 0);
  expect(limiter.take('script', 0)).toEqual({ allowed: false, report: true });
  for (let elapsed = 100; elapsed < 30_000; elapsed += 100)
    expect(limiter.take('script', elapsed).report).toBe(false);
  limiter.take('script', 30_000);
  expect(limiter.take('script', 30_000).report).toBe(true);
});
