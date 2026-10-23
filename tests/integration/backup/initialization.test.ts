import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBackupDataFixture } from './data-fixture.ts';
import {
  beginSetupRequest,
  claimRestoreSetup,
  createSetupState,
  releaseRestoreSetup,
} from '../../../src/server/identity/setup.ts';

let root: string;
let fixture: ReturnType<typeof createBackupDataFixture>;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ariso-initialization-'));
  fixture = createBackupDataFixture(root, false);
});
afterEach(async () => {
  fixture.close();
  await rm(root, { recursive: true, force: true });
});

describe('normal setup and restore share the same initialization reservation', () => {
  it('lets already-admitted setup requests finish while preventing a restore claim', () => {
    const state = createSetupState(fixture.db, fixture.paths.database);
    const first = beginSetupRequest(state);
    const second = beginSetupRequest(state);
    expect(() => claimRestoreSetup(state, randomUUID())).toThrowError(/初始化/);
    first();
    first();
    expect(() => claimRestoreSetup(state, randomUUID())).toThrow();
    second();
    const id = randomUUID();
    claimRestoreSetup(state, id);
    expect(state.restoreJobId).toBe(id);
    expect(() => beginSetupRequest(state)).toThrowError(/恢复/);
    releaseRestoreSetup(state, id);
    const release = beginSetupRequest(state);
    release();
  });

  it('does not let a different task release an existing restore reservation', () => {
    const state = createSetupState(fixture.db, fixture.paths.database);
    const id = randomUUID();
    claimRestoreSetup(state, id);
    expect(() => claimRestoreSetup(state, randomUUID())).toThrow();
    releaseRestoreSetup(state, randomUUID());
    expect(state.restoreJobId).toBe(id);
  });
});
