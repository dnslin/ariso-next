'use client';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BackupJob } from '../../server/backup/types';
import {
  BackupRequestError,
  backupRequest,
  createBackup,
  deleteBackup,
} from './client';
import { backupActivityKey } from './use-backup-activity';

export type BackupScope = {
  images: number;
  objects: number;
  bytes: number;
  freeBytes: number | null;
  estimatedBytes: number;
  storages: Array<{
    id: string;
    name: string;
    type: 'local' | 's3';
    enabled: boolean;
    images: number;
    bytes: number;
  }>;
};
export type BackupList = {
  items: BackupJob[];
  nextCursor: string | null;
  availability: { supported: boolean; message?: string };
  scope: BackupScope;
};
export const isBackupActive = (job: BackupJob) =>
  ['preparing', 'copying', 'finalizing'].includes(job.status);

export function useBackups() {
  const client = useQueryClient();
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const cursor = cursors.at(-1) ?? null;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [selected, setSelected] = useState<BackupJob | null>(null);
  const intent = useRef<string | null>(null);
  const running = useRef(false);
  const query = useQuery({
    queryKey: ['backup', 'list', cursor],
    queryFn: ({ signal }) =>
      backupRequest<BackupList>(
        `/api/backups?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
      ),
    refetchInterval: (state) =>
      state.state.data?.items.some(isBackupActive) ? 1000 : false,
    retry: false,
  });
  function accept(job: BackupJob) {
    setSelected(job);
    client.setQueryData(backupActivityKey, {
      paused: isBackupActive(job),
      job: isBackupActive(job) ? job : null,
    });
    void client.invalidateQueries({ queryKey: ['backup', 'list'] });
    void client.invalidateQueries({ queryKey: backupActivityKey });
  }
  async function run(action: () => Promise<void>) {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setMessage('');
    try {
      await action();
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '操作未完成，请重新读取任务',
      );
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function create(password: string) {
    return run(async () => {
      intent.current ??= crypto.randomUUID();
      try {
        const { job } = await createBackup(intent.current, password);
        accept(job);
        setUncertain(false);
        intent.current = null;
        setCursors([null]);
      } catch (error) {
        const unknown = error instanceof BackupRequestError && error.uncertain;
        setUncertain(unknown);
        if (!unknown) intent.current = null;
        throw error;
      }
    });
  }
  function checkCreation() {
    return run(async () => {
      if (!intent.current) return;
      const { job } = await backupRequest<{ job: BackupJob }>(
        `/api/backups/${encodeURIComponent(intent.current)}`,
      );
      accept(job);
      setUncertain(false);
      intent.current = null;
      setCursors([null]);
    });
  }
  function cancel(id: string) {
    return run(async () => {
      try {
        accept(
          (
            await backupRequest<{ job: BackupJob }>(
              `/api/backups/${encodeURIComponent(id)}/cancel`,
              { method: 'POST' },
            )
          ).job,
        );
      } catch (error) {
        if (error instanceof BackupRequestError && error.uncertain) {
          accept(
            (
              await backupRequest<{ job: BackupJob }>(
                `/api/backups/${encodeURIComponent(id)}`,
              )
            ).job,
          );
          setMessage('已重新读取任务。只有显示已取消时，取消才已完成。');
        } else throw error;
      }
    });
  }
  function remove(id: string) {
    return run(async () => {
      await deleteBackup(id);
      if (selected?.id === id) setSelected(null);
      await client.invalidateQueries({ queryKey: ['backup', 'list'] });
    });
  }
  const first = query.data?.items[0] ?? null;
  const current = selected
    ? (query.data?.items.find((job) => job.id === selected.id) ?? selected)
    : first;
  return {
    query,
    busy,
    message,
    uncertain,
    current,
    create,
    checkCreation,
    cancel,
    remove,
    canPrevious: cursors.length > 1,
    previous: () => setCursors((value) => value.slice(0, -1)),
    next: () => {
      if (query.data?.nextCursor)
        setCursors((value) => [...value, query.data!.nextCursor]);
    },
  };
}
