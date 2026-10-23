import type { BuildIdentity } from '../runtime/build-info.ts';
import type { BackupSummary } from './manifest.ts';
import type { RestoreRemoteTarget } from './restore-remote-types.ts';

export type BackupProgress = {
  objectsDone: number;
  objectsTotal: number;
  bytesDone: number;
  bytesTotal: number;
};

type JobDetails = {
  id: string;
  createdAt: number;
  updatedAt: number;
  failure?: { code: string; message: string };
  failedPhase?: string;
  summary?: BackupSummary;
  application?: BuildIdentity;
  progress?: BackupProgress;
};

export type BackupJob = JobDetails & {
  kind: 'backup';
  status:
    | 'preparing'
    | 'copying'
    | 'finalizing'
    | 'ready'
    | 'failed'
    | 'interrupted'
    | 'cancelled';
  fileName?: string;
  fileBytes?: number;
};

export type RestoreJob = JobDetails & {
  kind: 'restore';
  status:
    | 'receiving'
    | 'received'
    | 'decrypting'
    | 'configuring'
    | 'restoring'
    | 'ready'
    | 'activating'
    | 'completed'
    | 'failed'
    | 'interrupted'
    | 'cancelled';
  receivedBytes: number;
  uploadBytes: number;
  publicUrl?: string;
  cleanupPending?: boolean;
  targets?: RestoreRemoteTarget[];
};

export type BackupJobState = BackupJob | RestoreJob;
