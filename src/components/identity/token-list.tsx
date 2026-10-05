'use client';

import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Spinner } from '@heroui/react/spinner';
import { Power, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TokenRecord } from './token-request';
import { tokenExpired } from './token-time';
import { TokenSummary } from './token-summary';
import type { TokenActionController } from './token-use-action';

export function TokenList({
  tokens,
  timeZone,
  actions,
}: {
  tokens: TokenRecord[];
  timeZone: string;
  actions: TokenActionController;
}) {
  const [time, setTime] = useState(() => Date.now());
  useEffect(() => {
    const current = Date.now();
    const next = tokens.reduce((earliest, { expiresAt }) => {
      const value = expiresAt
        ? new Date(expiresAt).getTime()
        : Number.POSITIVE_INFINITY;
      return value > current ? Math.min(earliest, value) : earliest;
    }, Number.POSITIVE_INFINITY);
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(
      () => setTime(Date.now()),
      Math.min(next - current, 2147483647),
    );
    return () => clearTimeout(timer);
  }, [tokens, time]);
  return (
    <div data-testid="api-list" className="grid gap-4">
      {tokens.map((token) => {
        const expired = tokenExpired(token.expiresAt);
        const working =
          actions.action?.token.id === token.id &&
          actions.action.phase === 'working';
        return (
          <Card
            key={token.id}
            data-testid="api-token"
            data-token-id={token.id}
            data-state={
              expired ? 'expired' : token.enabled ? 'enabled' : 'disabled'
            }
            className="grid min-w-0 gap-2.5 rounded-xl border border-border bg-surface p-4 shadow-none"
          >
            <TokenSummary token={token} timeZone={timeZone} />
            <div className="flex gap-3">
              <Button
                data-testid="api-toggle"
                variant="outline"
                className="h-12 min-h-12 w-24 rounded-lg bg-background text-sm font-normal"
                isDisabled={expired || !!actions.action}
                onPress={() => actions.toggle(token)}
              >
                {working && actions.action?.kind === 'toggle' ? (
                  <Spinner size="sm" />
                ) : (
                  <Power className="size-4" aria-hidden />
                )}
                {expired
                  ? '已过期'
                  : working && actions.action?.kind === 'toggle'
                    ? token.enabled
                      ? '停用中…'
                      : '启用中…'
                    : token.enabled
                      ? '停用'
                      : '启用'}
              </Button>
              <Button
                data-testid="api-revoke"
                variant="outline"
                className="h-12 min-h-12 w-24 rounded-lg bg-background text-sm font-normal"
                isDisabled={!!actions.action}
                onPress={() => actions.revoke(token)}
              >
                <Trash2 className="size-4" aria-hidden />
                撤销
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
