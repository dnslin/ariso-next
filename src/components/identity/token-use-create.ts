'use client';

import { createElement, useEffect, useRef, useState } from 'react';
import type { CalendarDateTime } from '@internationalized/date';
import { toast } from '@heroui/react/toast';
import { CircleCheck } from 'lucide-react';
import {
  createToken,
  newTokenCandidates,
  readTokens,
  tokenNameSchema,
  TokenRequestError,
  type TokenRecord,
} from './token-request';
import { tokenExpiresIn } from './token-time';

type Props = {
  timeZone: string;
  tokens: TokenRecord[];
  onRecord: (token: TokenRecord) => void;
  onRecords: (tokens: TokenRecord[]) => void;
  onClose: () => void;
  onUncertainClose: () => void;
  onSessionExpire: () => void;
};
type Phase =
  | 'editing'
  | 'creating'
  | 'failed'
  | 'secret'
  | 'close-confirm'
  | 'unknown'
  | 'checking'
  | 'check-failed'
  | 'checked';

export function useTokenCreate(props: Props) {
  const { onClose } = props;
  const [name, setName] = useState('');
  const [finite, setFinite] = useState(false);
  const [expiry, setExpiry] = useState<CalendarDateTime | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');
  const [phase, setPhase] = useState<Phase>('editing');
  const [secret, setSecret] = useState('');
  const [record, setRecord] = useState<TokenRecord | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [candidates, setCandidates] = useState<TokenRecord[]>([]);
  const beforeIds = useRef<string[]>([]);
  const [focusTarget, setFocusTarget] = useState<{ field: string } | null>(
    null,
  );
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const busy = phase === 'creating' || phase === 'checking';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!focusTarget || busy) return;
    const element =
      focusTarget.field === 'name'
        ? document.getElementById('api-name')
        : document.querySelector<HTMLElement>(
            '[data-testid="api-expiry-input"] [data-segment-type="year"]',
          );
    element?.focus();
  }, [focusTarget, busy]);
  useEffect(() => {
    const clear = () => {
      setSecret('');
      onClose();
    };
    window.addEventListener('pagehide', clear);
    return () => window.removeEventListener('pagehide', clear);
  }, [onClose]);

  function changeName(value: string) {
    setName(value);
    setErrors((current) => ({ ...current, name: '' }));
  }
  function changeExpiry(value: CalendarDateTime | null) {
    setExpiry(value);
    setErrors((current) => ({ ...current, expiresIn: '' }));
  }
  function close() {
    if (inFlight.current) return;
    if (secret) setPhase('close-confirm');
    else {
      if (phase === 'unknown' || phase === 'check-failed')
        props.onUncertainClose();
      props.onClose();
    }
  }
  function savedClose() {
    if (inFlight.current) return;
    setSecret('');
    props.onClose();
  }
  async function submit() {
    if (inFlight.current) return;
    const parsed = tokenNameSchema.safeParse(name);
    const invalid: Record<string, string> = {};
    if (!parsed.success) invalid.name = parsed.error.issues[0].message;
    let expiresIn: number | undefined;
    if (finite) {
      try {
        expiresIn = tokenExpiresIn(expiry, props.timeZone);
      } catch (error) {
        invalid.expiresIn = (error as Error).message;
      }
    }
    setErrors(invalid);
    if (!parsed.success || Object.keys(invalid).length) {
      setPhase('editing');
      setFocusTarget({ field: invalid.name ? 'name' : 'expiresIn' });
      return;
    }
    beforeIds.current = props.tokens.map(({ id }) => id);
    setFocusTarget(null);
    setFeedback('');
    setPhase('creating');
    inFlight.current = true;
    try {
      const result = await createToken({
        name: parsed.data,
        ...(finite ? { expiresIn } : {}),
      });
      if (!mounted.current) return;
      props.onRecord(result.token);
      setRecord(result.token);
      setSecret(result.key);
      setPhase('secret');
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof TokenRequestError && error.status < 500) {
        if (error.status === 401) {
          props.onSessionExpire();
          return;
        }
        setErrors(
          Object.fromEntries(
            error.fields.map(({ field, message }) => [field, message]),
          ),
        );
        if (error.fields.length) {
          setFocusTarget({ field: error.fields[0].field });
          setPhase('editing');
        } else setPhase('failed');
      } else setPhase('unknown');
      setFeedback(error instanceof Error ? error.message : '无法确认创建结果');
    } finally {
      inFlight.current = false;
    }
  }
  async function check() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase('checking');
    setFeedback('');
    try {
      const tokens = await readTokens();
      if (!mounted.current) return;
      props.onRecords(tokens);
      setCandidates(newTokenCandidates(beforeIds.current, tokens));
      setPhase('checked');
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof TokenRequestError && error.status === 401) {
        props.onSessionExpire();
        return;
      }
      setFeedback(
        error instanceof Error ? error.message : '无法核对 Token 列表',
      );
      setPhase('check-failed');
    } finally {
      inFlight.current = false;
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      if (mounted.current) {
        setCopyFailed(false);
        toast('Token 已复制', {
          variant: 'default',
          indicator: createElement(CircleCheck, {
            size: 20,
            'aria-hidden': true,
          }),
        });
      }
      return true;
    } catch {
      if (mounted.current) setCopyFailed(true);
      return false;
    }
  }
  return {
    name,
    finite,
    expiry,
    errors,
    feedback,
    phase,
    secret,
    record,
    copyFailed,
    candidates,
    busy,
    changeName,
    changeExpiry,
    close,
    savedClose,
    submit,
    check,
    copy,
    keepSecret: () => setPhase('secret'),
    enableExpiry: () => setFinite(true),
    removeExpiry: () => {
      setFinite(false);
      setExpiry(null);
      setErrors((current) => ({ ...current, expiresIn: '' }));
    },
  };
}

export type TokenCreator = ReturnType<typeof useTokenCreate>;
