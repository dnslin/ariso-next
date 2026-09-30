import type { ProbeStageResult } from './probe-types.ts';

export type CorsBrowserResult = {
  method: 'PUT' | 'GET' | 'HEAD';
  status: number;
  responseType: 'cors' | 'basic' | 'opaque' | 'error';
  error?: string;
};
export type CorsReport = {
  probeId: string;
  storageId: string;
  revision: number;
  origin: string;
  passed: boolean;
  stale: boolean;
  cleanupPending: boolean;
  stages: ProbeStageResult[];
  testedAt: string;
};
export type CorsSignature = {
  url: string;
  method: 'PUT' | 'GET' | 'HEAD';
  headers: Record<string, string>;
  expiresAt: string;
  key: string;
};
export type CorsTestSession = {
  probeId: string;
  storageId: string;
  revision: number;
  origin: string;
  payload: string;
  upload: CorsSignature;
  get: CorsSignature;
  head: CorsSignature;
  expiresAt: string;
};
export type CorsTestState = {
  origin: string;
  example: {
    AllowedOrigins: string[];
    AllowedMethods: string[];
    AllowedHeaders: string[];
  }[];
  status: 'untested' | 'passed' | 'failed' | 'invalidated';
  report: CorsReport | null;
  probes: {
    probeId: string;
    state: 'running' | 'cleanup';
    stage: string;
    key: string;
    invalidated: boolean;
    expiresAt: string | null;
    error: string | null;
    report: CorsReport;
  }[];
};
