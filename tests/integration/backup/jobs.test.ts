import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  listBackupJobs,
  listRestoreJobs,
  readJobState,
  writeJobState,
} from '../../../src/server/backup/jobs.ts';
import type {
  BackupJob,
  RestoreJob,
} from '../../../src/server/backup/types.ts';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ariso-backup-jobs-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function restore(): RestoreJob {
  return {
    kind: 'restore',
    id: randomUUID(),
    status: 'receiving',
    createdAt: 10,
    updatedAt: 10,
    uploadBytes: 100,
    receivedBytes: 0,
  };
}

describe('backup control records outside the business database', () => {
  it('treats missing job directories and records as uninitialized', () => {
    expect(readJobState(join(root, 'restore/missing'))).toBeNull();
    expect(listRestoreJobs(root)).toEqual([]);
    expect(listBackupJobs(root)).toEqual([]);
    expect(readdirSync(root)).toEqual([]);
  });

  it('publishes complete private state and replaces it without retaining temp files', () => {
    const state = restore();
    const directory = join(root, 'restore', state.id);
    writeJobState(directory, state);
    const ready = {
      ...state,
      status: 'ready' as const,
      receivedBytes: 100,
      updatedAt: 20,
    };
    writeJobState(directory, ready);
    expect(readJobState(directory)).toEqual(ready);
    expect(
      JSON.parse(readFileSync(join(directory, 'state.json'), 'utf8')),
    ).toEqual(ready);
    expect(readdirSync(directory)).toEqual(['state.json']);
    expect(statSync(join(directory, 'state.json')).mode & 0o777).toBe(0o600);
  });

  it('keeps backup history and restore control separate, with newest first', () => {
    const first = restore();
    const next = { ...restore(), createdAt: 20, updatedAt: 20 };
    const backup: BackupJob = {
      kind: 'backup',
      id: randomUUID(),
      createdAt: 30,
      updatedAt: 30,
      status: 'ready',
      fileName: 'site.zip.age',
    };
    writeJobState(join(root, 'restore', first.id), first);
    writeJobState(join(root, 'restore', next.id), next);
    writeJobState(join(root, 'backups', backup.id), backup);
    expect(listRestoreJobs(root)).toEqual([next, first]);
    expect(listBackupJobs(root)).toEqual([backup]);
  });

  it('does not mistake an unfinished record write for a running task', () => {
    const directory = join(root, 'restore', randomUUID());
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'state.json.part'), '{incomplete');
    expect(listRestoreJobs(root)).toEqual([]);
  });

  it('preserves corruption as a diagnosable error', () => {
    const state = restore();
    const directory = join(root, 'restore', state.id);
    writeJobState(directory, state);
    writeFileSync(join(directory, 'state.json'), '{broken');
    expect(() => listRestoreJobs(root)).toThrow();
  });
});
