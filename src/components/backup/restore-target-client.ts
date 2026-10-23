import type { RestoreJob } from '../../server/backup/types';
import type {
  RestoreRemoteTargetInput,
  RestoreRemoteTestInput,
} from '../../server/backup/restore-remote-types';
import { backupRequest, BackupRequestError, jsonRequest } from './client';

type Options = {
  id: string;
  storageId: string;
  setupCode: string;
  signal?: AbortSignal;
  onJob?: (job: RestoreJob) => void;
  onSaved?: () => void;
};
function accept(options: Options, job: RestoreJob | undefined) {
  if (job?.id !== options.id)
    throw new BackupRequestError(
      '未读到可确认的恢复任务，请重新读取结果。',
      'BACKUP_RESPONSE_INVALID',
      200,
      true,
    );
  options.onJob?.(job);
  return job;
}
async function save(options: Options, input: RestoreRemoteTargetInput) {
  const { job } = await backupRequest<{ job: RestoreJob }>(
    `/api/setup/restore/${options.id}/targets/${encodeURIComponent(options.storageId)}`,
    {
      method: 'PUT',
      setupCode: options.setupCode,
      signal: options.signal,
      ...jsonRequest(input),
    },
  );
  accept(options, job);
  if (!options.signal?.aborted) options.onSaved?.();
  return job;
}
export async function saveAndTestRestoreTarget(
  options: Options & {
    input?: RestoreRemoteTargetInput;
    revision?: number;
    wholeBucketHasNoLockRules?: boolean;
  },
) {
  let revision = options.revision;
  if (options.input) {
    const job = await save(options, options.input);
    revision = job.targets?.find(
      (target) => target.storageId === options.storageId,
    )?.revision;
  }
  if (revision === undefined)
    throw new BackupRequestError(
      '未读到目标配置版本，请重新读取恢复任务。',
      'BACKUP_RESPONSE_INVALID',
      200,
      true,
    );
  const body: RestoreRemoteTestInput = {
    revision,
    ...(options.wholeBucketHasNoLockRules
      ? { wholeBucketHasNoLockRules: true }
      : {}),
  };
  const { job } = await backupRequest<{ job: RestoreJob }>(
    `/api/setup/restore/${options.id}/targets/${encodeURIComponent(options.storageId)}/test`,
    {
      method: 'POST',
      setupCode: options.setupCode,
      signal: options.signal,
      ...jsonRequest(body),
    },
  );
  return accept(options, job);
}
export async function repairRestoreTargetCredentials(
  options: Options & { input: RestoreRemoteTargetInput },
) {
  await save(options, options.input);
  const { job } = await backupRequest<{ job: RestoreJob }>(
    `/api/setup/restore/${options.id}/cancel`,
    {
      method: 'POST',
      setupCode: options.setupCode,
      signal: options.signal,
    },
  );
  return accept(options, job);
}
