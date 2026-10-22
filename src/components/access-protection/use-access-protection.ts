'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@heroui/react/toast';
import type {
  AccessProtectionInput,
  AccessProtectionSettingsResponse,
} from '../../server/access-protection/types';
import {
  accessProtectionFieldErrors,
  accessProtectionInputSchema,
} from '../../server/access-protection/validation';
import {
  accessProtectionQueryKey,
  accessProtectionRequest,
  AccessProtectionRequestError,
} from './api';
import {
  protectionInput,
  protectionMatches,
  protectionSubmission,
} from './model';

type Phase =
  'ready' | 'saving' | 'unknown' | 'checking' | 'check-error' | 'different';

export function useAccessProtection(
  initial: AccessProtectionSettingsResponse | null,
) {
  const [saved, setSaved] = useState<AccessProtectionSettingsResponse | null>(
    null,
  );
  const [input, setInput] = useState<AccessProtectionInput>({
    mode: 'observe',
    rate: Number.NaN,
    burst: Number.NaN,
  });
  const [phase, setPhase] = useState<Phase>('ready');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [expired, setExpired] = useState(false);
  const pending = useRef<AccessProtectionInput | null>(null);
  const request = useRef<AbortController | null>(null);
  const active = useRef(true);
  const notice = useRef<string | null>(null);
  const client = useQueryClient();
  if (!saved && initial && !expired) {
    setSaved(initial);
    setInput(protectionInput(initial));
  }
  const busy = !expired && (phase === 'saving' || phase === 'checking');
  const uncertain = [
    'unknown',
    'checking',
    'check-error',
    'different',
  ].includes(phase);
  const locked = !saved || busy || uncertain || expired;
  const ipBlocked =
    !!saved && input.mode === 'enforce' && !saved.clientIp.ready;
  const dirty =
    !!saved && !protectionMatches(protectionSubmission(input, saved), saved);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      request.current?.abort();
      if (notice.current) toast.close(notice.current);
    };
  }, []);
  const expire = useCallback(() => {
    active.current = false;
    request.current?.abort();
    setExpired(true);
  }, []);
  function notify(title: string) {
    if (notice.current) toast.close(notice.current);
    notice.current = toast(title, { variant: 'default' });
  }
  function focusErrors(fields: { field: string; message: string }[]) {
    setErrors(
      Object.fromEntries(fields.map(({ field, message }) => [field, message])),
    );
    if (!fields.length) return;
    requestAnimationFrame(() => {
      if (!active.current) return;
      document
        .querySelector<HTMLElement>(
          `[data-protection-field="${CSS.escape(fields[0].field)}"] input:not([type="hidden"])`,
        )
        ?.focus();
    });
  }
  function change<K extends keyof AccessProtectionInput>(
    field: K,
    value: AccessProtectionInput[K],
  ) {
    if (locked || request.current || !active.current) return;
    setInput((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (field === 'mode' && value === 'off') return {};
      const next = { ...current };
      delete next[field];
      return next;
    });
    setMessage('');
  }
  function suggested() {
    if (locked || input.mode === 'off' || request.current || !active.current)
      return;
    setInput((current) => ({ ...current, rate: 10, burst: 200 }));
    setErrors({});
    setMessage('');
  }
  function accept(value: AccessProtectionSettingsResponse) {
    setSaved(value);
    client.setQueryData(accessProtectionQueryKey, value);
  }
  async function save() {
    if (!saved || locked || ipBlocked || request.current || !active.current)
      return;
    const parsed = accessProtectionInputSchema.safeParse(
      protectionSubmission(input, saved),
    );
    if (!parsed.success) {
      focusErrors(accessProtectionFieldErrors(parsed.error));
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    pending.current = parsed.data;
    setPhase('saving');
    setErrors({});
    setMessage('');
    try {
      const value = await accessProtectionRequest({
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
        signal: controller.signal,
      });
      if (!active.current) return;
      accept(value);
      setInput(protectionInput(value));
      pending.current = null;
      setPhase('ready');
      notify('访问防护已保存');
    } catch (error) {
      if (!active.current) return;
      if (error instanceof AccessProtectionRequestError && error.status < 500) {
        pending.current = null;
        setPhase('ready');
        setMessage(error.message);
        focusErrors(error.fields);
        if (error.status === 401) expire();
        if (error.code === 'ACCESS_PROTECTION_IP_UNAVAILABLE') {
          setSaved((current) =>
            current
              ? {
                  ...current,
                  clientIp: { ready: false, message: error.message },
                }
              : current,
          );
        }
      } else {
        setPhase('unknown');
        setMessage('保存结果尚未确认。当前输入已保留，请先核对已保存设置。');
      }
    } finally {
      request.current = null;
      if (!active.current)
        void client.invalidateQueries({ queryKey: accessProtectionQueryKey });
    }
  }
  async function reconcile() {
    if (!saved || expired || request.current || !active.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPhase('checking');
    setMessage('');
    try {
      const value = await accessProtectionRequest({
        signal: controller.signal,
      });
      if (!active.current) return;
      accept(value);
      if (pending.current && protectionMatches(pending.current, value)) {
        setInput(protectionInput(value));
        pending.current = null;
        setPhase('ready');
        notify('已确认上次保存');
      } else {
        setPhase('different');
      }
    } catch (error) {
      if (!active.current) return;
      setPhase('check-error');
      setMessage(error instanceof Error ? error.message : String(error));
      if (error instanceof AccessProtectionRequestError && error.status === 401)
        expire();
    } finally {
      request.current = null;
    }
  }
  function chooseSaved(useSaved: boolean) {
    if (!saved || expired || request.current || !active.current) return;
    if (useSaved) setInput(protectionInput(saved));
    pending.current = null;
    setErrors({});
    setMessage('');
    setPhase('ready');
  }
  return {
    saved,
    input,
    phase,
    errors,
    message,
    expired,
    busy,
    uncertain,
    locked,
    ipBlocked,
    dirty,
    change,
    suggested,
    save,
    reconcile,
    chooseSaved,
    expire,
  };
}
