'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from '@heroui/react/toast';
import { SiteRequestError } from './api';
import {
  brandAsset,
  brandLabels,
  readBrandSettings,
  withBrandAsset,
  writeBrandAsset,
  type BrandKind,
  type BrandSettings,
} from './branding-api';

type Operation = {
  kind: BrandKind;
  file: File | null;
  previewUrl: string | null;
};
type Phase =
  | 'selected'
  | 'saving'
  | 'failed'
  | 'unknown'
  | 'checking'
  | 'check-error'
  | 'different';

/** A read-back identifies the current reference, never proves a selected File was saved. */
export function useBranding(initial: BrandSettings | null) {
  const [saved, setSaved] = useState(initial);
  const [source, setSource] = useState(initial);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [phase, setPhase] = useState<Phase>('selected');
  const [message, setMessage] = useState('');
  const [expired, setExpired] = useState(false);
  const mounted = useRef(true);
  const expiredRef = useRef(false);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const successToast = useRef<string | null>(null);
  const client = useQueryClient();
  const router = useRouter();
  if (initial !== source) {
    setSource(initial);
    if (initial && !expired) setSaved(initial);
  }
  const busy = phase === 'saving' || phase === 'checking';
  const uncertain = [
    'unknown',
    'checking',
    'check-error',
    'different',
  ].includes(phase);
  const locked = expired || busy || uncertain;
  const expire = useCallback(() => {
    expiredRef.current = true;
    controller.current?.abort();
    setPhase((current) =>
      current === 'saving' || current === 'checking' ? 'unknown' : current,
    );
    setExpired(true);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);
  function accept(value: BrandSettings) {
    setSaved(value);
    client.setQueryData(['site-branding'], value);
    void client.invalidateQueries({ queryKey: ['site-settings'] });
    router.refresh();
  }
  function clear() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setOperation(null);
    setPhase('selected');
    setMessage('');
  }
  function select(kind: BrandKind, file: File | null) {
    if (!saved || locked || inFlight.current) return;
    if (successToast.current) toast.close(successToast.current);
    successToast.current = null;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = file ? URL.createObjectURL(file) : null;
    setOperation({ kind, file, previewUrl: previewUrl.current });
    setPhase('selected');
    setMessage('');
  }
  function cancel() {
    if (!locked && !inFlight.current) clear();
  }
  async function save(confirmedRetry = false) {
    if (
      !saved ||
      !operation ||
      expiredRef.current ||
      busy ||
      inFlight.current ||
      (locked && !(confirmedRetry && phase === 'different'))
    )
      return;
    inFlight.current = true;
    controller.current = new AbortController();
    setPhase('saving');
    setMessage('');
    try {
      const asset = await writeBrandAsset(
        operation.kind,
        operation.file,
        controller.current.signal,
      );
      if (!mounted.current || expiredRef.current) return;
      accept(withBrandAsset(saved, operation.kind, asset));
      // PUT/DELETE returns only this asset. Refetch the other current brand fields.
      void client.invalidateQueries({ queryKey: ['site-branding'] });
      clear();
      successToast.current = toast(
        `${brandLabels[operation.kind]} 已${operation.file ? '更新' : '移除'}`,
        { variant: 'default' },
      );
    } catch (error) {
      if (!mounted.current || expiredRef.current) return;
      if (error instanceof SiteRequestError && error.status === 401) {
        expire();
        return;
      }
      const rejected = error instanceof SiteRequestError && error.status < 500;
      setPhase(rejected ? 'failed' : 'unknown');
      setMessage(
        error instanceof Error ? error.message : '未取得确定的操作结果',
      );
    } finally {
      inFlight.current = false;
    }
  }
  async function reconcile() {
    if (!operation || expiredRef.current || inFlight.current || !uncertain)
      return;
    inFlight.current = true;
    controller.current = new AbortController();
    setPhase('checking');
    setMessage('');
    try {
      const value = await readBrandSettings(controller.current.signal);
      if (!mounted.current || expiredRef.current) return;
      accept(value);
      if (!operation.file && brandAsset(value, operation.kind).url === null) {
        clear();
        successToast.current = toast(
          `${brandLabels[operation.kind]} 已无自定义素材`,
          {
            variant: 'default',
          },
        );
      } else setPhase('different');
    } catch (error) {
      if (!mounted.current || expiredRef.current) return;
      if (error instanceof SiteRequestError && error.status === 401) {
        expire();
        return;
      }
      setPhase('check-error');
      setMessage(error instanceof Error ? error.message : '核对失败');
    } finally {
      inFlight.current = false;
    }
  }
  function useServer() {
    if (phase === 'different' && !expiredRef.current) clear();
  }
  function retry() {
    if (phase !== 'different' || expiredRef.current) return;
    setPhase('selected');
    setMessage('');
  }
  return {
    saved,
    operation,
    phase,
    message,
    expired,
    busy,
    uncertain,
    locked,
    expire,
    select,
    cancel,
    save,
    reconcile,
    useServer,
    retry,
  };
}
