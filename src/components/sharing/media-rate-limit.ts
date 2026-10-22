'use client';

import { useEffect, useState } from 'react';

export function mediaRetryAt(response: Response, now = Date.now()) {
  if (response.status !== 429) return null;
  const value = response.headers.get('retry-after');
  if (value && /^[0-9]+$/.test(value)) {
    const milliseconds = Number(value) * 1000;
    if (Number.isSafeInteger(milliseconds)) return now + milliseconds;
  } else if (value) {
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(now, date);
  }
  return now + 1000;
}

/** This only confirms current throttling; it cannot recover the failed GET's status. */
export async function probeMediaRateLimit(
  url: string,
  origin: string,
  signal: AbortSignal,
) {
  const target = new URL(url, origin);
  if (target.origin !== origin || signal.aborted) return null;
  try {
    const response = await fetch(target.href, {
      method: 'HEAD',
      redirect: 'manual',
      cache: 'no-store',
      signal,
    });
    return signal.aborted ? null : mediaRetryAt(response);
  } catch {
    // Keep the existing image failure when this extra check cannot confirm 429.
    return null;
  }
}

export function useRetryCountdown(until: number | null) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (until === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function tick() {
      const current = Date.now();
      setNow(current);
      if (current < until!)
        timer = setTimeout(tick, Math.min(1000, until! - current));
    }
    tick();
    return () => clearTimeout(timer);
  }, [until]);
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}
