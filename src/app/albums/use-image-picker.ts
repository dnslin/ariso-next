'use client';

import { useEffect, useRef, useState } from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { toast } from '@heroui/react/toast';
import type { LibraryItem } from '../../server/library/types';
import type { BatchItemResult } from '../../server/library/batch-types';
import { notifyLibraryChanged } from '../../components/library/library-changes';
import { BatchRequestError } from '../../components/library/batch-request';
import { LibraryReadError } from '../library/use-library-query';
import { AlbumRequestError } from './api';
import { addAlbumImages, readAlbumImageChoices } from './image-picker-request';

export function useAlbumImagePicker({
  albumId,
  isOpen,
  onExpire,
  onChanged,
  onClose,
}: {
  albumId: string;
  isOpen: boolean;
  onExpire: () => void;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [client] = useState(() => new QueryClient());
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Map<string, LibraryItem>());
  const [pending, setPending] = useState(false);
  const [unknownIds, setUnknownIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [failures, setFailures] = useState<BatchItemResult[]>([]);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  useEffect(
    () => () => {
      controller.current?.abort();
      client.clear();
    },
    [client],
  );
  const list = useQuery(
    {
      queryKey: ['album-image-choices', albumId, q, page],
      enabled: isOpen,
      queryFn: ({ signal }) => readAlbumImageChoices(albumId, q, page, signal),
      retry: false,
      refetchOnWindowFocus: false,
      networkMode: 'always',
    },
    client,
  );
  useEffect(() => {
    if (
      (list.error instanceof LibraryReadError ||
        list.error instanceof AlbumRequestError) &&
      list.error.status === 401
    )
      onExpire();
  }, [list.error, onExpire]);
  useEffect(() => {
    if (!list.data || list.isError) return;
    const existing = new Set(list.data.memberIds);
    // A fresh membership read can resolve joins made elsewhere; pending results still need their explicit check.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reconcile the local selection with newly read server membership.
    setSelected((previous) => {
      const next = new Map(
        [...previous].filter(
          ([id]) => !existing.has(id) || unknownIds.includes(id),
        ),
      );
      return next.size === previous.size ? previous : next;
    });
  }, [list.data, list.isError, unknownIds]);

  function toggle(item: LibraryItem) {
    if (
      pending ||
      unknownIds.length ||
      list.isFetching ||
      list.isError ||
      list.data?.memberIds.includes(item.id)
    )
      return;
    setSelected((previous) => {
      const next = new Map(previous);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  }

  async function run(mode: 'apply' | 'check') {
    if (busy.current || (mode === 'apply' && unknownIds.length)) return;
    const ids = mode === 'check' ? unknownIds : [...selected.keys()];
    if (!ids.length) return;
    busy.current = true;
    setPending(true);
    setError('');
    const active = new AbortController();
    controller.current = active;
    const results = new Map<string, BatchItemResult>();
    try {
      const outcome = await addAlbumImages(
        albumId,
        ids,
        mode,
        active.signal,
        (items) => {
          for (const item of items) results.set(item.id, item);
        },
      );
      if (active.signal.aborted) return;
      const confirmed = [...results.values()].filter(
        (item) => item.status === 'changed' || item.status === 'unchanged',
      );
      const confirmedIds = new Set(confirmed.map((item) => item.id));
      const failed = [...results.values()].filter(
        (item) => item.status === 'failed',
      );
      const remaining = [...selected.keys()].filter(
        (id) => !confirmedIds.has(id),
      );
      setSelected(
        (previous) =>
          new Map([...previous].filter(([id]) => !confirmedIds.has(id))),
      );
      setUnknownIds(outcome.unknownIds);
      setFailures(failed);
      if (outcome.unknownIds.length)
        setError('部分图片结果待核对，已保留选择，请先核对结果。');
      else if (remaining.length)
        setError(
          `${confirmed.length ? `${confirmed.length} 张已加入相册，` : ''}${remaining.length} 张尚未添加，已保留选择。`,
        );
      if (confirmed.length) {
        notifyLibraryChanged();
        await client.invalidateQueries({
          queryKey: ['album-image-choices', albumId],
        });
        try {
          await onChanged();
        } catch (refreshError) {
          setError(
            `图片已添加，相册刷新失败：${refreshError instanceof Error ? refreshError.message : String(refreshError)}`,
          );
          return;
        }
      }
      if (!remaining.length && !outcome.unknownIds.length) {
        toast.success(`已加入相册：${confirmed.length} 张`);
        setFailures([]);
        onClose();
      }
    } catch (failure) {
      if (active.signal.aborted) return;
      if (failure instanceof BatchRequestError && failure.status === 401) {
        onExpire();
        return;
      }
      setError(
        `${failure instanceof Error ? failure.message : String(failure)}。已保留选择。`,
      );
    } finally {
      if (controller.current === active) {
        controller.current = null;
        busy.current = false;
        if (!active.signal.aborted) setPending(false);
      }
    }
  }

  return {
    list,
    q,
    page,
    selected,
    pending,
    unknownIds,
    error,
    failures,
    pages: Math.max(1, Math.ceil((list.data?.total ?? 0) / 40)),
    setQuery: (value: string) => {
      setQ(value);
      setPage(1);
    },
    setPage,
    toggle,
    clear: () => {
      if (!pending && !unknownIds.length) {
        setSelected(new Map());
        setFailures([]);
        setError('');
      }
    },
    submit: () => void run(unknownIds.length ? 'check' : 'apply'),
  };
}
