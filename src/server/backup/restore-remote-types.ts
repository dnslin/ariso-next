import type { ConnectionReport } from '../storage/probe-types.ts';
export type RestoreRemoteTargetInput = {
  endpoint: string;
  region: string;
  bucket: string;
  pathPrefix: string;
  forcePathStyle: boolean;
  accessKey?: string;
  secretKey?: string;
};

export type RestoreRemoteTarget = Omit<
  RestoreRemoteTargetInput,
  'accessKey' | 'secretKey'
> & {
  storageId: string;
  namespace: string;
  credentialsConfigured: boolean;
  revision: number;
  testedRevision: number | null;
  testStatus: 'untested' | 'testing' | 'passed' | 'failed';
  testedAt: number | null;
  cleanupPending: boolean;
  writeStarted: boolean;
  failure?: { code: string; message: string };
};

export type RestoreRemoteTestInput = {
  revision: number;
  wholeBucketHasNoLockRules?: boolean;
};

export type RestoreRemoteSource = {
  storageId: string;
  name: string;
  endpoint: string;
  region: string;
  bucket: string;
  pathPrefix: string;
  forcePathStyle: boolean;
  configRevision: number;
};

export type RestoredRemoteConfiguration = {
  storageId: string;
  endpoint: string;
  region: string;
  bucket: string;
  pathPrefix: string;
  forcePathStyle: boolean;
  accessKeyEncrypted: string;
  secretKeyEncrypted: string;
  revision: number;
  testedAt: number;
  connectionReport: ConnectionReport;
};
