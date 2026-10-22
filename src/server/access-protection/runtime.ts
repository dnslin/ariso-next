import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Logger } from 'pino';
import { clientIpStatus, readClientIp } from '../http/client-ip.ts';
import { createAccessLimiter } from './limiter.ts';
import { requireAccessProtectionSettings } from './settings.ts';

const responseHeaders = {
  'Cache-Control': 'private, no-store, no-transform',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

export function createAccessProtectionRuntime(options: {
  db: BetterSQLite3Database;
  logger: Pick<Logger, 'info' | 'warn'>;
  now?: () => number;
}) {
  const now = options.now ?? (() => performance.now());
  let policy = '';
  let limiter: ReturnType<typeof createAccessLimiter> | undefined;
  let unavailableReportedAt = Number.NEGATIVE_INFINITY;
  const timer = setInterval(() => limiter?.prune(now()), 60_000);
  timer.unref();
  function reset() {
    limiter?.clear();
    limiter = undefined;
    policy = '';
    unavailableReportedAt = Number.NEGATIVE_INFINITY;
  }
  return {
    reset,
    check(request: Request, owner: boolean): Response | null {
      // Identity has already been verified by the route. No budget is touched.
      if (owner || !['GET', 'HEAD'].includes(request.method)) return null;
      const settings = requireAccessProtectionSettings(options.db);
      const nextPolicy = `${settings.mode}/${settings.rate}/${settings.burst}`;
      if (nextPolicy !== policy) {
        policy = nextPolicy;
        limiter = createAccessLimiter(settings);
        unavailableReportedAt = Number.NEGATIVE_INFINITY;
      }
      if (settings.mode === 'off') return null;
      const time = now();
      const ip = readClientIp(request);
      if (!ip) {
        if (time - unavailableReportedAt >= 30_000) {
          unavailableReportedAt = time;
          options.logger.warn(
            {
              event: 'access-protection',
              mode: settings.mode,
              outcome: 'ip-unavailable',
              reason: clientIpStatus(request).message,
            },
            'Visitor IP unavailable for access protection',
          );
        }
        if (settings.mode === 'observe') return null;
        return new Response(
          request.method === 'HEAD'
            ? null
            : JSON.stringify({
                code: 'ACCESS_PROTECTION_IP_UNAVAILABLE',
                message: '无法识别访问来源，请稍后重试',
              }),
          { status: 503, headers: responseHeaders },
        );
      }
      const decision = limiter!.take(ip, time);
      if (decision.allowed) return null;
      const outcome = settings.mode === 'observe' ? 'would-block' : 'blocked';
      if (decision.report) {
        const detail = {
          event: 'access-protection',
          mode: settings.mode,
          outcome,
          ip,
          rate: settings.rate,
          burst: settings.burst,
          sampleWindowSeconds: 30,
        };
        if (settings.mode === 'observe')
          options.logger.info(
            detail,
            'Anonymous image request exceeds access allowance',
          );
        else
          options.logger.warn(detail, 'Anonymous image request rate limited');
      }
      if (settings.mode === 'observe') return null;
      return new Response(
        request.method === 'HEAD'
          ? null
          : JSON.stringify({
              code: 'ACCESS_RATE_LIMITED',
              message: '访问较频繁，请稍后重试',
            }),
        { status: 429, headers: { ...responseHeaders, 'Retry-After': '1' } },
      );
    },
    stop() {
      clearInterval(timer);
      reset();
    },
  };
}
