import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  createFixtureAuth,
  openFixture,
  seedOwner,
} from '../../experiments/identity/fixture.ts';
import { account, user } from '../../experiments/identity/schema.ts';

let directory: string;
let connection: ReturnType<typeof openFixture>;
const email = 'owner@example.test';
const password = 'identity-experiment-password';
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-identity-db-'));
  connection = openFixture(join(directory, 'auth.db'));
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

it('two processes race owner creation: one complete credential and no partial loser', async () => {
  const run = promisify(execFile);
  const attempts = await Promise.allSettled(
    [0, 1].map((i) =>
      run(
        process.execPath,
        [
          resolve('tests/experiments/identity/seed.ts'),
          join(directory, 'auth.db'),
          `owner${i}@example.test`,
          password,
        ],
        { timeout: 20000 },
      ),
    ),
  );
  expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const rejected = attempts.find((r) => r.status === 'rejected');
  expect(rejected?.reason.stderr).toContain(
    'UNIQUE constraint failed: user.owner_slot',
  );
  const users = connection.db.select().from(user).all();
  const accounts = connection.db.select().from(account).all();
  expect(users).toHaveLength(1);
  expect(accounts).toHaveLength(1);
  expect(accounts[0]).toMatchObject({
    userId: users[0].id,
    accountId: users[0].id,
    providerId: 'credential',
  });
}, 30000);

it('owner CHECK/NOT NULL/default/UNIQUE and provider uniqueness are database constraints', async () => {
  const id = await seedOwner(connection.db, email, password);
  expect(connection.db.select().from(user).get()?.ownerSlot).toBe(1);
  for (const value of ['NULL', '0', '2']) {
    expect(() =>
      connection.db.$client.exec(`UPDATE user SET owner_slot = ${value}`),
    ).toThrow();
  }
  expect(() =>
    connection.db
      .insert(account)
      .values({
        id: randomUUID(),
        userId: id,
        accountId: 'another',
        providerId: 'credential',
        updatedAt: new Date(),
      })
      .run(),
  ).toThrow();
  connection.db
    .insert(account)
    .values({
      id: randomUUID(),
      userId: id,
      accountId: 'github-id',
      providerId: 'github',
      updatedAt: new Date(),
    })
    .run();
  expect(() =>
    connection.db
      .insert(account)
      .values({
        id: randomUUID(),
        userId: id,
        accountId: 'other-github-id',
        providerId: 'github',
        updatedAt: new Date(),
      })
      .run(),
  ).toThrow();
});

it('a failed synchronous seed transaction rolls back the user and can be retried', async () => {
  connection.db.$client.exec(
    "CREATE TRIGGER reject_credential BEFORE INSERT ON account BEGIN SELECT RAISE(ABORT, 'injected credential failure'); END",
  );
  await expect(seedOwner(connection.db, email, password)).rejects.toThrow();
  expect(connection.db.select().from(user).all()).toEqual([]);
  connection.db.$client.exec('DROP TRIGGER reject_credential');
  await seedOwner(connection.db, email, password);
  expect(connection.db.select().from(account).all()).toHaveLength(1);
});

it('library reads/writes the additional field without enabling registration', async () => {
  const auth = createFixtureAuth(
    connection.db,
    'http://localhost:3000',
    randomBytes(32).toString('hex'),
  );
  const context = await auth.$context;
  const created = await context.internalAdapter.createUser(
    { name: 'Owner', email, emailVerified: false },
    { method: 'email-password' },
  );
  expect(created.ownerSlot).toBe(1);
  expect(connection.db.select().from(user).get()?.ownerSlot).toBe(1);
  await expect(
    auth.api.signUpEmail({
      body: { name: 'Other', email: 'other@example.test', password },
    }),
  ).rejects.toMatchObject({
    status: 'BAD_REQUEST',
    body: { code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED' },
  });
});

it('the enabled asynchronous adapter transaction fails with synchronous SQLite; use explicit false', async () => {
  const auth = createFixtureAuth(
    connection.db,
    'http://localhost:3000',
    randomBytes(32).toString('hex'),
    true,
  );
  const { adapter } = await auth.$context;
  await expect(adapter.transaction(async () => 'async result')).rejects.toThrow(
    'Transaction function cannot return a promise',
  );
});
