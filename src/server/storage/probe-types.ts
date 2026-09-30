export type ProbeStage =
  | 'configuration'
  | 'write'
  | 'read'
  | 'anonymous'
  | 'delete'
  | 'browser-put'
  | 'browser-get'
  | 'browser-head'
  | 'verify';
export type ProbeStageResult = {
  stage: ProbeStage;
  status: 'pending' | 'passed' | 'failed' | 'skipped';
  evidence?: unknown;
  error?: {
    message: string;
    code?: string;
    serviceCode?: string;
    requestId?: string;
    httpStatusCode?: number;
  };
};
export type ConnectionReport = {
  probeId: string;
  storageId: string;
  revision: number;
  passed: boolean;
  stale: boolean;
  cleanupPending: boolean;
  stages: ProbeStageResult[];
  deploymentRequirement: string;
  testedAt: string;
  ownerConfirmation: {
    wholeBucketHasNoLockRules: boolean;
    confirmedAt: string | null;
  };
};
