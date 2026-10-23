import { mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { verifyPassword } from 'better-auth/crypto';
import { resetCliPassword } from '../../../src/server/identity/reset-password.ts';
import { writeJobState } from '../../../src/server/backup/jobs.ts';
import type { RestoreJob } from '../../../src/server/backup/types.ts';
import { startTerminal } from '../../../scripts/terminal.ts';
import { createBackupDataFixture } from './data-fixture.ts';
const hooks = vi.hoisted(() => ({
  afterHash: undefined as (() => void) | undefined,
}));
vi.mock('better-auth/crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('better-auth/crypto')>();
  return {
    ...actual,
    async hashPassword(value: string) {
      const result = await actual.hashPassword(value);
      hooks.afterHash?.();
      return result;
    },
  };
});
let root: string;
let fixture: ReturnType<typeof createBackupDataFixture>;
let state: RestoreJob;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ariso-cli-activation-'));
  fixture = createBackupDataFixture(root);
  state = {
    kind: 'restore',
    id: 'job',
    status: 'ready',
    createdAt: 1,
    updatedAt: 1,
    receivedBytes: 1,
    uploadBytes: 1,
  };
  hooks.afterHash = undefined;
});
afterEach(() => {
  if (fixture.db.$client.open) fixture.close();
  rmSync(root, { recursive: true, force: true });
});
it('the real CLI checks activation before attempting to open a missing live database', async () => {
  writeJobState(join(root, 'restore', 'job'), {
    ...state,
    status: 'activating',
  });
  fixture.close();
  renameSync(join(root, 'ariso.db'), join(root, 'moved.db'));
  const terminal = startTerminal(
    [process.execPath, resolve('src/cli/reset-password.ts')],
    { cwd: resolve('.'), env: { DATA_DIR: root } },
  );
  try {
    expect(await terminal.result).toEqual({
      exitCode: 1,
      terminalRestored: true,
    });
    expect(terminal.output()).toContain('RESTORE_ACTIVATING');
    expect(terminal.output()).not.toContain('未初始化');
  } finally {
    await terminal.stop();
  }
}, 15000);
it('a restore beginning during real password hashing prevents the final write; completed allows recovery', async () => {
  writeJobState(join(root, 'restore', 'job'), state);
  hooks.afterHash = () =>
    writeJobState(join(root, 'restore', 'job'), {
      ...state,
      status: 'activating',
    });
  await expect(
    resetCliPassword(fixture.db, 'new-long-password', 'new-long-password'),
  ).rejects.toMatchObject({ code: 'RESTORE_ACTIVATING' });
  expect(
    fixture.db.$client.prepare('SELECT password FROM account').get(),
  ).toEqual({ password: 'retained-password-hash' });
  hooks.afterHash = undefined;
  writeJobState(join(root, 'restore', 'job'), {
    ...state,
    status: 'completed',
  });
  await resetCliPassword(fixture.db, 'new-long-password', 'new-long-password');
  const credential = fixture.db.$client
    .prepare('SELECT password FROM account')
    .get() as { password: string };
  expect(
    await verifyPassword({
      hash: credential.password,
      password: 'new-long-password',
    }),
  ).toBe(true);
}, 15000);
