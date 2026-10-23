import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RestoreJob } from '../../../src/server/backup/types';
import type {
  RestoreRemoteTarget,
  RestoreRemoteTargetInput,
} from '../../../src/server/backup/restore-remote-types';
const state = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    state.value ??= initial;
    return [
      state.value,
      (next: unknown) => {
        state.value = typeof next === 'function' ? next(state.value) : next;
      },
    ];
  },
}));
import { useRestoreTargets } from '../../../src/components/backup/use-restore-targets';
beforeEach(() => {
  state.value = undefined;
});
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const target: RestoreRemoteTarget = {
    storageId: 's3',
    endpoint: 'https://storage.example.test',
    region: 'auto',
    bucket: 'restore-bucket',
    pathPrefix: 'new',
    forcePathStyle: false,
    namespace: 'new/ariso/s3/',
    credentialsConfigured: true,
    revision: 1,
    testedRevision: 1,
    testStatus: 'passed',
    testedAt: 1,
    cleanupPending: false,
    writeStarted: false,
  };
  const job: RestoreJob = {
    id: 'task',
    kind: 'restore',
    status: 'configuring',
    receivedBytes: 1,
    uploadBytes: 1,
    createdAt: 1,
    updatedAt: 1,
    targets: [target],
    summary: {
      application: { version: 'v1.0.0', revision: 'a'.repeat(40) },
      snapshotCompletedAt: 1,
      siteName: '',
      publicUrl: '',
      ownerEmail: '',
      images: 1,
      objects: 1,
      bytes: 1,
      albums: 0,
      tags: 0,
      trashedImages: 0,
      storages: [
        {
          id: 's3',
          name: 'S3',
          type: 's3',
          enabled: false,
          images: 1,
          objects: 1,
          bytes: 1,
        },
      ],
    },
  };
  const actions = {
    targetFields: null,
    testTarget:
      vi.fn<
        (
          _: string,
          input?: RestoreRemoteTargetInput,
          confirmed?: boolean,
          onSaved?: () => void,
        ) => Promise<boolean>
      >(),
    repairTarget:
      vi.fn<
        (
          _: string,
          input: RestoreRemoteTargetInput,
          onSaved?: () => void,
        ) => Promise<boolean>
      >(),
  };
  return {
    target,
    job,
    actions,
    render: function RestoreTargetsHarness() {
      return useRestoreTargets(job, actions);
    },
  };
}
describe('remote restore draft lifecycle', () => {
  it('clears only confirmed saved credentials even when test delivery remains unknown', async () => {
    const { render, actions, target } = fixture();
    let current = render();
    current.change('s3', { ...current.input('s3'), secretKey: 'new-secret' });
    current = render();
    expect(current.ready).toBe(false);
    actions.testTarget.mockImplementation(
      async (_id, _input, _confirmed, onSaved) => {
        Object.assign(target, {
          revision: 2,
          testedRevision: null,
          testStatus: 'testing',
        });
        onSaved?.();
        return false;
      },
    );
    await current.test('s3');
    current = render();
    expect(current.input('s3').secretKey).toBe('');
    expect(current.ready).toBe(false);
    expect(current.testing).toBe(true);
    Object.assign(target, { testStatus: 'passed', testedRevision: 2 });
    expect(render().ready).toBe(true);
    expect(actions.testTarget).toHaveBeenCalledOnce();
  });
  it('uses saved remote coordinates when repairing credentials, even if a local draft changed them', async () => {
    const { render, actions, target, job } = fixture();
    job.cleanupPending = true;
    target.cleanupPending = true;
    let current = render();
    current.change('s3', {
      ...current.input('s3'),
      bucket: 'must-not-use',
      pathPrefix: 'must-not-use',
      secretKey: ' replacement ',
    });
    current = render();
    actions.repairTarget.mockResolvedValue(true);
    await current.repair('s3');
    expect(actions.repairTarget.mock.calls[0][1]).toEqual({
      endpoint: target.endpoint,
      region: target.region,
      bucket: target.bucket,
      pathPrefix: target.pathPrefix,
      forcePathStyle: false,
      secretKey: ' replacement ',
    });
    expect(actions.testTarget).not.toHaveBeenCalled();
  });
  it('never clears a newer draft from a late save callback', async () => {
    const { render, actions } = fixture();
    let current = render();
    current.change('s3', { ...current.input('s3'), secretKey: 'first' });
    current = render();
    let acknowledge: (() => void) | undefined;
    actions.testTarget.mockImplementation(
      async (_id, _input, _confirmed, onSaved) => {
        acknowledge = onSaved;
        return false;
      },
    );
    await current.test('s3');
    current = render();
    current.change('s3', { ...current.input('s3'), secretKey: 'newer' });
    acknowledge?.();
    expect(render().input('s3').secretKey).toBe('newer');
  });
  it('keeps drafts inside their restore job and focuses missing credentials without a request', async () => {
    const { render, job, target, actions } = fixture();
    let current = render();
    current.change('s3', {
      ...current.input('s3'),
      secretKey: 'old-task-secret',
    });
    job.id = 'new-task';
    target.credentialsConfigured = false;
    current = render();
    expect(current.input('s3').secretKey).toBe('');
    const focus = vi.fn();
    const getElementById = vi.fn(() => ({ focus }));
    vi.stubGlobal('document', { getElementById });
    vi.stubGlobal('requestAnimationFrame', (run: () => void) => run());
    await current.test('s3');
    expect(actions.testTarget).not.toHaveBeenCalled();
    expect(getElementById).toHaveBeenCalledWith('restore-s3-accessKey');
    expect(focus).toHaveBeenCalledOnce();
  });
});
