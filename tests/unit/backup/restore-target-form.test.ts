import { describe, expect, it } from 'vitest';
import type { RestoreRemoteTarget } from '../../../src/server/backup/restore-remote-types';
import {
  remoteTargetInitial,
  remoteTargetDirty,
  remoteTargetPayload,
  remoteTargetErrors,
  remoteTargetsReady,
} from '../../../src/components/backup/restore-target-form';

const target: RestoreRemoteTarget = {
  storageId: 'remote',
  endpoint: 'https://s3.example.test',
  region: 'auto',
  bucket: 'bucket',
  pathPrefix: 'restore',
  forcePathStyle: false,
  credentialsConfigured: true,
  namespace: 'restore/ariso/remote/',
  revision: 2,
  testedRevision: 2,
  testStatus: 'passed',
  testedAt: 1,
  cleanupPending: false,
  writeStarted: false,
};
describe('restore target drafts', () => {
  it('never populates saved credentials and omits empty replacements', () => {
    const value = remoteTargetInitial(target);
    expect(value.accessKey).toBe('');
    expect(value.secretKey).toBe('');
    expect(remoteTargetDirty(value, target)).toBe(false);
    expect(remoteTargetPayload(value)).toEqual({
      endpoint: target.endpoint,
      region: 'auto',
      bucket: 'bucket',
      pathPrefix: 'restore',
      forcePathStyle: false,
    });
  });
  it('keeps actual replacement credentials unchanged and invalidates a passed test locally', () => {
    const value = { ...remoteTargetInitial(target), secretKey: ' secret ' };
    expect(remoteTargetPayload(value).secretKey).toBe(' secret ');
    expect(remoteTargetDirty(value, target)).toBe(true);
    expect(remoteTargetsReady(['remote'], [target], { remote: value })).toBe(
      false,
    );
  });
  it('requires each current revision, saved credentials and no unfinished cleanup', () => {
    expect(remoteTargetsReady(['remote'], [target], {})).toBe(true);
    expect(remoteTargetsReady(['remote', 'second'], [target], {})).toBe(false);
    for (const changed of [
      { testedRevision: 1 },
      { testStatus: 'testing' as const },
      { cleanupPending: true },
      { credentialsConfigured: false },
    ]) {
      expect(
        remoteTargetsReady(['remote'], [{ ...target, ...changed }], {}),
      ).toBe(false);
    }
  });
  it('requires credentials for a new target but preserves saved ones on later changes', () => {
    expect(remoteTargetErrors(remoteTargetInitial(), false)).toMatchObject({
      endpoint: expect.any(String),
      bucket: expect.any(String),
      accessKey: expect.any(String),
      secretKey: expect.any(String),
    });
    expect(remoteTargetErrors(remoteTargetInitial(target), true)).toEqual({});
  });
});
