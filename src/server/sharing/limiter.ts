const windowMs = 60_000;
const attemptsPerWindow = 20;
const maxConcurrent = 2;
const maxShares = 10_000;

export class ShareRateLimitError extends Error {
  readonly code = 'SHARING_RATE_LIMITED';
  readonly status = 429;
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super('验证请求过多，请稍后重试');
    this.retryAfter = retryAfter;
  }
}

/** One instance per Web process; only existing password-protected shares enter. */
export function createShareLimiter() {
  const attempts = new Map<string, { count: number; resetsAt: number }>();
  let active = 0;
  function prune(now: number) {
    for (const [id, entry] of attempts)
      if (entry.resetsAt <= now) attempts.delete(id);
  }
  return {
    prune,
    acquire(shareId: string, now: number) {
      let entry = attempts.get(shareId);
      if (entry && entry.resetsAt <= now) {
        attempts.delete(shareId);
        entry = undefined;
      }
      if (!entry) {
        if (attempts.size >= maxShares) prune(now);
        if (attempts.size >= maxShares) throw new ShareRateLimitError(60);
        entry = { count: 0, resetsAt: now + windowMs };
        attempts.set(shareId, entry);
      }
      if (entry.count >= attemptsPerWindow)
        throw new ShareRateLimitError(
          Math.max(1, Math.ceil((entry.resetsAt - now) / 1000)),
        );
      entry.count++;
      if (active >= maxConcurrent) throw new ShareRateLimitError(1);
      active++;
      return () => {
        active--;
      };
    },
  };
}
