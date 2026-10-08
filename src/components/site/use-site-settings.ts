'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from '@heroui/react/toast';
import {
  siteRequest,
  SiteRequestError,
  type SiteSettingsResponse,
  type SiteSettingsPatchResponse,
} from './api';
import {
  siteDraft,
  validateSiteDraft,
  matchesSiteDraft,
  sitePhaseLocked,
  type SiteDraft,
  type SitePhase,
} from './model';

export function useSiteSettings(initial: SiteSettingsResponse | null) {
  const [input, setInput] = useState<SiteDraft>(() =>
    initial
      ? siteDraft(initial)
      : { name: '', description: '', publicUrl: '', timeZone: '' },
  );
  const [saved, setSaved] = useState(initial);
  const [phase, setPhase] = useState<SitePhase>('ready');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [expired, setExpired] = useState(false);
  const [originNotice, setOriginNotice] = useState(false);
  const [timeZoneNotice, setTimeZoneNotice] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);
  const pending = useRef<SiteDraft | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const expiredRef = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const client = useQueryClient();
  const router = useRouter();
  if (!saved && initial && !expired) {
    setSaved(initial);
    setInput(siteDraft(initial));
  }
  const locked = !saved || expired || sitePhaseLocked(phase);
  const expire = useCallback(() => {
    expiredRef.current = true;
    controller.current?.abort();
    setExpired(true);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!focusTarget || phase === 'saving' || phase === 'checking') return;
    const target = document.getElementById(focusTarget.id);
    if (target?.matches('input'))
      target
        .closest('[data-slot="textfield"]')
        ?.scrollIntoView({ block: 'nearest' });
    target?.focus({ preventScroll: true });
  }, [focusTarget, phase]);
  function change(field: keyof SiteDraft, value: string) {
    if (locked) return;
    setInput((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
    setMessage('');
    setPhase('ready');
  }
  function accept(value: SiteSettingsResponse) {
    if (saved?.publicUrl !== value.publicUrl) setOriginNotice(true);
    if (saved?.timeZone !== value.timeZone) setTimeZoneNotice(true);
    setSaved(value);
    client.setQueryData(['site-settings'], value);
    if (saved?.publicUrl !== value.publicUrl) {
      void client.invalidateQueries({ queryKey: ['storage-overview'] });
      void client.invalidateQueries({ queryKey: ['github-settings'] });
    }
    router.refresh();
  }
  async function save() {
    if (inFlight.current || locked) return;
    const parsed = validateSiteDraft(input);
    setErrors(parsed.errors);
    if (!parsed.value) {
      setFocusTarget({ id: `site-${Object.keys(parsed.errors)[0]}` });
      return;
    }
    inFlight.current = true;
    pending.current = parsed.value;
    controller.current = new AbortController();
    setPhase('saving');
    setMessage('');
    setFocusTarget(null);
    try {
      const value = await siteRequest<SiteSettingsPatchResponse>({
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.value),
        signal: controller.current.signal,
      });
      if (!mounted.current || expiredRef.current) return;
      accept(value);
      setInput(siteDraft(value));
      pending.current = null;
      setPhase('ready');
      toast('站点信息已保存', { variant: 'default' });
    } catch (error) {
      if (!mounted.current || expiredRef.current) return;
      if (error instanceof SiteRequestError && error.status < 500) {
        if (error.status === 401) {
          expire();
          return;
        }
        const invalid = Object.fromEntries(
          error.fields.map(({ field, message }) => [field, message]),
        );
        setErrors(invalid);
        setMessage(error.message);
        setPhase('ready');
        setFocusTarget({
          id: Object.keys(invalid).length
            ? `site-${Object.keys(invalid)[0]}`
            : 'site-feedback',
        });
        pending.current = null;
      } else {
        setPhase('unknown');
        setMessage(
          error instanceof Error ? error.message : '未取得确定的保存结果',
        );
        setFocusTarget({ id: 'site-reconcile' });
      }
    } finally {
      inFlight.current = false;
    }
  }
  async function reconcile() {
    if (inFlight.current || expiredRef.current || !pending.current) return;
    inFlight.current = true;
    controller.current = new AbortController();
    setPhase('checking');
    setFocusTarget(null);
    try {
      const value = await siteRequest<SiteSettingsResponse>({
        signal: controller.current.signal,
      });
      if (!mounted.current || expiredRef.current) return;
      accept(value);
      if (matchesSiteDraft(pending.current, value)) {
        pending.current = null;
        setPhase('confirmed');
        setMessage('');
        setFocusTarget({ id: 'site-feedback' });
      } else {
        setPhase('different');
        setMessage('当前输入仍保留，请决定使用哪一份。');
        setFocusTarget({ id: 'site-use-saved' });
      }
    } catch (error) {
      if (!mounted.current || expiredRef.current) return;
      if (error instanceof SiteRequestError && error.status === 401) {
        expire();
        return;
      }
      setPhase('check-error');
      setMessage(
        error instanceof Error ? error.message : '请检查连接后重新核对',
      );
      setFocusTarget({ id: 'site-reconcile' });
    } finally {
      inFlight.current = false;
    }
  }
  function chooseSaved(useSaved: boolean) {
    if (
      inFlight.current ||
      phase !== 'different' ||
      expiredRef.current ||
      !saved
    )
      return;
    if (useSaved) setInput(siteDraft(saved));
    pending.current = null;
    setErrors({});
    setMessage('');
    setPhase('ready');
    setFocusTarget({ id: 'site-save' });
    toast(useSaved ? '已使用服务器保存的设置' : '输入已保留，请点击保存', {
      variant: 'default',
    });
  }
  return {
    input,
    saved,
    phase,
    errors,
    message,
    expired,
    expire,
    locked,
    originNotice,
    timeZoneNotice,
    change,
    save,
    reconcile,
    chooseSaved,
  };
}
