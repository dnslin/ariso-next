import { CalendarDays, Clock, Terminal } from 'lucide-react';
import type { TokenRecord } from './token-request';
import { formatTokenTime, tokenExpired } from './token-time';

export function TokenSummary({
  token,
  timeZone,
}: {
  token: TokenRecord;
  timeZone: string;
}) {
  return (
    <>
      <h3 className="flex items-start gap-2 text-base font-medium wrap-anywhere">
        <Terminal className="mt-1 size-4 shrink-0" aria-hidden />
        <span className="min-w-0">{token.name ?? token.id}</span>
      </h3>
      <p className="flex items-start gap-2 text-[13px] leading-normal">
        <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {tokenExpired(token.expiresAt)
            ? '已过期'
            : token.enabled
              ? '已启用'
              : '已停用'}{' '}
          ·{' '}
          {token.expiresAt
            ? formatTokenTime(token.expiresAt, timeZone)
            : '永不过期'}
        </span>
      </p>
      <p className="flex items-start gap-2 text-xs leading-normal text-muted">
        <CalendarDays className="size-4 shrink-0" aria-hidden />
        <span>创建于 {formatTokenTime(token.createdAt, timeZone)}</span>
      </p>
      <p className="min-w-0 text-xs text-muted wrap-anywhere">
        ID：<code>{token.id}</code>
      </p>
    </>
  );
}
