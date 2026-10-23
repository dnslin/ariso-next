'use client';
import { useQuery } from '@tanstack/react-query';
import type { BackupJob } from '../../server/backup/types';
import { backupRequest } from './client';

export const backupActivityKey = ['backup', 'activity'] as const;
export function useBackupActivity(poll = false) {
  const query = useQuery({
    queryKey: backupActivityKey,
    queryFn: ({ signal }) =>
      backupRequest<{ paused: boolean; job: BackupJob | null }>(
        '/api/backups/activity',
        { signal },
      ),
    enabled: poll,
    refetchInterval: poll ? 2000 : false,
    retry: false,
  });
  return {
    ...query,
    paused: query.data?.paused ?? false,
    job: query.data?.job ?? null,
  };
}
