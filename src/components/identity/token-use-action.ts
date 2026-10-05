'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from '@heroui/react/toast';
import {
  readTokens,
  revokeToken,
  setTokenEnabled,
  TokenRequestError,
  type TokenRecord,
} from './token-request';
import { tokenExpired } from './token-time';

type Action = {
  kind: 'toggle' | 'revoke';
  token: Pick<TokenRecord, 'id' | 'name' | 'enabled'>;
  expired?: boolean;
  phase:
    | 'confirming'
    | 'working'
    | 'failed'
    | 'unknown'
    | 'checking'
    | 'check-failed'
    | 'checked';
  feedback: string;
  current?: TokenRecord | null;
};

export function useTokenAction({
  onRecord,
  onRecords,
  onRemoved,
  onSessionExpire,
  onUncertainClose,
}: {
  onRecord: (token: TokenRecord) => void;
  onRecords: (tokens: TokenRecord[]) => void;
  onRemoved: (id: string) => void;
  onSessionExpire: () => void;
  onUncertainClose: () => void;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const focusCreateOnClose = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (action || !focusCreateOnClose.current) return;
    focusCreateOnClose.current = false;
    const frame = requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>('[data-testid="api-create-open"]')
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [action]);
  const busy = action?.phase === 'working' || action?.phase === 'checking';

  async function submit(value: Action) {
    if (inFlight.current) return;
    inFlight.current = true;
    setAction({ ...value, phase: 'working', feedback: '' });
    try {
      if (value.kind === 'revoke') {
        await revokeToken(value.token.id);
        if (!mounted.current) return;
        onRemoved(value.token.id);
        focusCreateOnClose.current = true;
      } else {
        const token = await setTokenEnabled(
          value.token.id,
          !value.token.enabled,
        );
        if (!mounted.current) return;
        onRecord(token);
      }
      toast(
        value.kind === 'revoke'
          ? 'Token 已撤销'
          : value.token.enabled
            ? 'Token 已停用'
            : 'Token 已启用',
        { variant: 'default' },
      );
      setAction(null);
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof TokenRequestError && error.status === 401) {
        onSessionExpire();
        return;
      }
      const message =
        error instanceof Error ? error.message : '无法确认 Token 操作结果';
      setAction({
        ...value,
        phase:
          error instanceof TokenRequestError &&
          error.status >= 400 &&
          error.status < 500
            ? 'failed'
            : 'unknown',
        feedback: message,
      });
    } finally {
      inFlight.current = false;
    }
  }

  async function check() {
    if (!action || inFlight.current) return;
    const value = action;
    inFlight.current = true;
    setAction({ ...value, phase: 'checking', feedback: '' });
    try {
      const tokens = await readTokens();
      if (!mounted.current) return;
      onRecords(tokens);
      setAction({
        ...value,
        phase: 'checked',
        feedback: '',
        current: tokens.find(({ id }) => id === value.token.id) ?? null,
      });
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof TokenRequestError && error.status === 401) {
        onSessionExpire();
        return;
      }
      setAction({
        ...value,
        phase: 'check-failed',
        feedback:
          error instanceof Error ? error.message : '无法核对 Token 列表',
      });
    } finally {
      inFlight.current = false;
    }
  }

  return {
    action,
    busy,
    toggle: ({ id, name, enabled }: TokenRecord) => {
      if (!action)
        void submit({
          kind: 'toggle',
          token: { id, name, enabled },
          phase: 'working',
          feedback: '',
        });
    },
    revoke: ({ id, name, enabled, expiresAt }: TokenRecord) => {
      if (!action)
        setAction({
          kind: 'revoke',
          token: { id, name, enabled },
          expired: tokenExpired(expiresAt),
          phase: 'confirming',
          feedback: '',
        });
    },
    confirm: () => {
      if (action?.phase === 'confirming') void submit(action);
    },
    retry: () => {
      if (action?.phase === 'failed') void submit(action);
    },
    close: () => {
      if (inFlight.current) return;
      if (
        action?.phase === 'unknown' ||
        action?.phase === 'check-failed' ||
        action?.phase === 'failed'
      )
        onUncertainClose();
      if (action?.phase === 'checked' && action.current === null)
        focusCreateOnClose.current = true;
      setAction(null);
    },
    check,
  };
}

export type TokenActionController = ReturnType<typeof useTokenAction>;
