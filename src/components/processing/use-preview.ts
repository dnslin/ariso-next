'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MediaSettingsInput } from '../../server/media/validation';
import type { PreviewInput } from '../../server/media/preview-validation';
import {
  processingRequest,
  ProcessingRequestError,
  previewUrl,
  type MediaPreview,
} from './api';
import { renderingParameters } from './model';

export function usePreview(
  input: MediaSettingsInput,
  expired: boolean,
  onExpire: () => void,
) {
  const [file, setSelectedFile] = useState<File | null>(null);
  const [fileRevision, setFileRevision] = useState(0);
  const [target, setTarget] = useState<PreviewInput['target']>('compressed');
  const [submitted, setSubmitted] = useState<{
    id: string | null;
    fileName: string;
    fileRevision: number;
    target: PreviewInput['target'];
    signature: string;
  }>();
  const [busy, setBusy] = useState<'creating' | 'cancelling' | null>(null);
  const [unknown, setUnknown] = useState<'create' | 'cancel' | null>(null);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const client = useQueryClient();
  const id = submitted?.id;
  const query = useQuery({
    queryKey: ['media-preview', id],
    queryFn: ({ signal }) =>
      processingRequest<MediaPreview>(previewUrl(id!), { signal }),
    enabled: Boolean(id) && !expired && !busy && !unknown,
    retry: false,
    networkMode: 'always',
    refetchInterval: (current) => {
      const value = current.state.data;
      if (!value || expired || unknown || busy) return false;
      if (['receiving', 'queued', 'running'].includes(value.status))
        return 1000;
      return value.status === 'succeeded' && value.expiresAt
        ? Math.max(1000, Date.parse(value.expiresAt) - Date.now() + 50)
        : false;
    },
  });
  const sessionLost =
    query.error instanceof ProcessingRequestError && query.error.status === 401;
  useEffect(() => {
    if (sessionLost) onExpire();
  }, [sessionLost, onExpire]);
  const record = query.data;
  const active = Boolean(
    (record && ['receiving', 'queued', 'running'].includes(record.status)) ||
    busy === 'cancelling' ||
    unknown === 'cancel',
  );
  const signature = JSON.stringify(renderingParameters(input));
  const stale = Boolean(
    submitted &&
    (submitted.signature !== signature ||
      submitted.target !== target ||
      submitted.fileRevision !== fileRevision),
  );
  function setFile(value: File | null) {
    setSelectedFile(value);
    setFileRevision((current) => current + 1);
  }
  function update(value: MediaPreview) {
    client.setQueryData(['media-preview', value.id], value);
  }
  async function remove(previousId: string) {
    await client.cancelQueries({ queryKey: ['media-preview', previousId] });
    const value = await processingRequest<MediaPreview>(
      previewUrl(previousId),
      { method: 'DELETE' },
    );
    update(value);
    return value;
  }
  async function create(
    onFields: (fields: { field: string; message: string }[]) => void,
    recreate = false,
  ) {
    if (!file || inFlight.current || (unknown && !recreate) || expired) return;
    inFlight.current = true;
    setBusy('creating');
    setUnknown(null);
    setMessage('');
    const selected = { fileName: file.name, fileRevision, target, signature };
    const options: PreviewInput = {
      target,
      settings: renderingParameters(input),
    };
    try {
      if (id && record?.cleanupStatus !== 'deleted') {
        let previous;
        try {
          previous = await remove(id);
        } catch (error) {
          if (!(error instanceof ProcessingRequestError) || error.status >= 500)
            setUnknown('cancel');
          throw error;
        }
        if (previous.cleanupStatus === 'failed') {
          setMessage(
            `旧预览清理失败，请重试清理后再生成。${previous.cleanupError ?? ''}`,
          );
          return;
        }
      }
      const body = new FormData();
      body.append('file', file);
      body.append('options', JSON.stringify(options));
      try {
        const value = await processingRequest<MediaPreview>(
          '/api/media/previews',
          { method: 'POST', body },
        );
        update(value);
        setSubmitted({ ...selected, id: value.id });
      } catch (error) {
        if (error instanceof ProcessingRequestError && error.previewId) {
          setSubmitted({ ...selected, id: error.previewId });
          onFields(error.fields);
        } else if (
          !(error instanceof ProcessingRequestError) ||
          error.status >= 500
        ) {
          setSubmitted({ ...selected, id: null });
          setUnknown('create');
        } else onFields(error.fields);
        throw error;
      }
    } catch (error) {
      if (error instanceof ProcessingRequestError && error.status === 401)
        onExpire();
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }
  async function cancel() {
    if (!id || inFlight.current || expired) return;
    inFlight.current = true;
    setBusy('cancelling');
    setMessage('');
    try {
      await remove(id);
      setUnknown(null);
    } catch (error) {
      if (!(error instanceof ProcessingRequestError) || error.status >= 500)
        setUnknown('cancel');
      if (error instanceof ProcessingRequestError && error.status === 401)
        onExpire();
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }
  const refetch = query.refetch;
  const refresh = useCallback(async () => {
    const value = await refetch();
    if (value.data && !value.error) {
      setUnknown(null);
      setMessage('');
    }
  }, [refetch]);
  const status = expired
    ? 'session'
    : (busy ??
      (unknown
        ? `${unknown}-unknown`
        : (record?.status ?? (id ? 'loading' : 'empty'))));
  return {
    file,
    setFile,
    target,
    setTarget,
    submitted,
    record,
    stale,
    status,
    active,
    busy,
    unknown,
    message,
    queryError: query.error,
    refreshing: query.isFetching,
    create,
    cancel,
    refresh,
  };
}
