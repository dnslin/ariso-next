'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useResetUpload } from '../upload/provider';
import type {
  CorsReport,
  CorsTestSession,
  CorsTestState,
} from '../../server/storage/cors-types';
import {
  corsRequest,
  CorsRequestError,
  corsUrl,
  type CorsStorage,
} from './cors-api';
import { runCorsSample } from './cors-transport';

export function useCorsTest(storageId: string) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const resetUpload = useResetUpload();
  const client = useQueryClient();
  const queryKey = ['storage-cors', storageId];
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const [storage, state] = await Promise.all([
        corsRequest<CorsStorage>(
          `/api/storages/${encodeURIComponent(storageId)}`,
          { signal },
        ),
        corsRequest<CorsTestState>(corsUrl(storageId), { signal }),
      ]);
      return { storage, state };
    },
    retry: false,
    networkMode: 'always',
    refetchInterval: (current) =>
      current.state.data?.state.probes.some((p) => p.state === 'running')
        ? 2000
        : false,
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  const expired =
    query.error instanceof CorsRequestError && query.error.status === 401;
  useEffect(() => {
    if (!expired) return;
    resetUpload();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname)}`,
    );
  }, [expired, resetUpload]);

  function showError(error: unknown, fallback: string) {
    if (!mounted.current) return;
    if (error instanceof CorsRequestError && error.status === 401) {
      resetUpload();
      window.location.replace(
        `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname)}`,
      );
      return;
    }
    setMessage(
      `${fallback}${error instanceof Error ? `：${error.message}` : ''}`,
    );
  }

  async function refresh() {
    setMessage('');
    return query.refetch();
  }

  async function start() {
    if (inFlight.current || !query.data || query.isError) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    const abort = new AbortController();
    controller.current = abort;
    try {
      const session = await corsRequest<CorsTestSession>(corsUrl(storageId), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revision: query.data.storage.configRevision }),
      });
      const results = await runCorsSample(
        session,
        AbortSignal.any([abort.signal, AbortSignal.timeout(60000)]),
      );
      await corsRequest<CorsReport>(
        `${corsUrl(storageId)}/${encodeURIComponent(session.probeId)}/complete`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ results }),
        },
      );
    } catch (error) {
      showError(
        error,
        '尚未确认检测完成，请重新读取结果。服务端会保留清理责任',
      );
    } finally {
      if (mounted.current) {
        await client.invalidateQueries({ queryKey });
        setBusy(false);
      }
      inFlight.current = false;
      controller.current = null;
    }
  }

  async function retryCleanup(probeId: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      await corsRequest(
        `/api/storages/${encodeURIComponent(storageId)}/probes/${encodeURIComponent(probeId)}/retry-cleanup`,
        { method: 'POST' },
      );
    } catch (error) {
      showError(error, '清理未完成');
    } finally {
      if (mounted.current) {
        await client.invalidateQueries({ queryKey });
        setBusy(false);
      }
      inFlight.current = false;
    }
  }
  return { query, busy, message, start, refresh, retryCleanup };
}
