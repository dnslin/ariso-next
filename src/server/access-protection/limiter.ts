type Policy = { rate: number; burst: number };
type Bucket = { tokens: number; updatedAt: number; reportedAt: number };

/** One process-wide pool; paths and versions never create separate allowances. */
export function createAccessLimiter(policy: Policy) {
  const buckets = new Map<string, Bucket>();
  const available = (bucket: Bucket, now: number) =>
    Math.min(
      policy.burst,
      bucket.tokens +
        (Math.max(0, now - bucket.updatedAt) / 1000) * policy.rate,
    );
  return {
    take(ip: string, now: number) {
      let bucket = buckets.get(ip);
      if (!bucket) {
        bucket = {
          tokens: policy.burst,
          updatedAt: now,
          reportedAt: Number.NEGATIVE_INFINITY,
        };
        buckets.set(ip, bucket);
      }
      const tokens = available(bucket, now);
      if (tokens >= 1) {
        bucket.tokens = tokens - 1;
        bucket.updatedAt = now;
        return { allowed: true, report: false };
      }
      // Rejections leave the refill clock unchanged and cannot extend a ban.
      const report = now - bucket.reportedAt >= 30_000;
      if (report) bucket.reportedAt = now;
      return { allowed: false, report };
    },
    prune(now: number) {
      for (const [ip, bucket] of buckets)
        if (available(bucket, now) >= policy.burst) buckets.delete(ip);
    },
    clear() {
      buckets.clear();
    },
  };
}
