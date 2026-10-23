import type { BuildIdentity } from '../runtime/build-info.ts';
import type { BackupSummary } from './manifest.ts';
import type { BackupProgress } from './types.ts';

type Common = { jobDirectory: string; application: BuildIdentity };
export type BackupWorkerInput = Common &
  (
    | {
        kind: 'backup';
        dataDir: string;
        fileName: string;
        encryptionKey: Uint8Array;
        password: string;
      }
    | { kind: 'inspect'; password: string }
    | {
        kind: 'restore';
        jobId: string;
        encryptionKey: Uint8Array;
        publicUrl: string;
      }
  );
export type BackupWorkerResult =
  | { kind: 'backup'; summary: BackupSummary; fileBytes: number }
  | { kind: 'inspect' | 'restore'; summary: BackupSummary };
export type BackupWorkerProgress = {
  type: 'progress';
  stage: 'preparing' | 'copying' | 'finalizing' | 'decrypting' | 'restoring';
  summary?: BackupSummary;
  progress?: BackupProgress;
};
export type BackupWorkerMessage =
  | BackupWorkerProgress
  | { type: 'complete'; result: BackupWorkerResult }
  | { type: 'error'; code: string; message: string };
