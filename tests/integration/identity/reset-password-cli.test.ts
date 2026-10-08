import { randomBytes, randomUUID } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import { resetCliPassword } from '../../../src/server/identity/reset-password.ts';
import { updateOwnerPassword } from '../../../src/server/identity/account.ts';
import { getAuth } from '../../../src/server/identity/auth.ts';
import {
  account,
  session,
  user,
  verification,
} from '../../../src/server/identity/schema.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { parseRuntimeEnv } from '../../../src/server/runtime/env.ts';
import { email, password, seedAuthOwner } from './auth-fixture.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import { launch, stop, unusedPort } from '../runtime/process-helpers.ts';
import { prepareInitialStorage } from '../../../src/server/storage/defaults.ts';
import { startTerminal } from '../../../scripts/terminal.ts';

// The real library calculation still runs. Gates only control when it returns.
const cryptoGates = vi.hoisted(() => ({
  hashing: undefined as (() => void) | undefined,
  hashed: undefined as ((value: string) => Promise<void>) | undefined,
  verified: undefined as (() => Promise<void>) | undefined,
}));
vi.mock('better-auth/crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('better-auth/crypto')>();
  return {
    ...actual,
    async hashPassword(value: string) {
      cryptoGates.hashing?.();
      const hash = await actual.hashPassword(value);
      await cryptoGates.hashed?.(value);
      return hash;
    },
    async verifyPassword(input: Parameters<typeof actual.verifyPassword>[0]) {
      const valid = await actual.verifyPassword(input);
      await cryptoGates.verified?.();
      return valid;
    },
  };
});

const root = resolve('.');
const origin = 'http://localhost:3000';
const cliPassword = 'cli-recovery-test-password';
const webPassword = 'web-recovery-test-password';
let packaged: string;
let packageDirectory: string;
let directory: string;
let databasePath: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let auth: NonNullable<ReturnType<typeof getAuth>>;
let ownerId: string;
let requestIp = 0;

beforeAll(async () => {
  // Exercise the shipped artifact; this test never compiles or traces a substitute.
  packageDirectory = await mkdtemp(
    join(tmpdir(), 'ariso-password-standalone-'),
  );
  await expect(
    stat(join(packageDirectory, 'node_modules')),
  ).rejects.toMatchObject({ code: 'ENOENT' });
  await cp(join(root, '.next/standalone'), packageDirectory, {
    recursive: true,
    verbatimSymlinks: true,
  });
  const require = createRequire(join(packageDirectory, 'package.json'));
  for (const dependency of ['better-sqlite3', 'better-auth/crypto'])
    expect(await realpath(require.resolve(dependency))).toContain(
      `${await realpath(packageDirectory)}/`,
    );
  packaged = join(packageDirectory, 'dist/cli/reset-password.js');
  expect((await stat(packaged)).isFile()).toBe(true);
}, 30000);

afterAll(async () => {
  if (packageDirectory)
    await rm(packageDirectory, { recursive: true, force: true });
});

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-cli-reset-'));
  databasePath = join(directory, 'ariso.db');
  connection = openRuntimeDatabase(databasePath);
  migrate(connection.db, { migrationsFolder: resolve('drizzle') });
  ownerId = await seedAuthOwner(connection, origin);
  auth = getAuth({
    connection,
    github: { enabled: false, clientId: '', clientSecret: null },
    config: parseRuntimeEnv({
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      LOG_LEVEL: 'error',
    }),
  })!;
  connection.db
    .insert(verification)
    .values([
      {
        id: randomUUID(),
        identifier: 'reset-password:unused-cli-reset',
        value: ownerId,
        expiresAt: new Date(Date.now() + 3600000),
      },
      {
        id: randomUUID(),
        identifier: 'oauth-state:preserved',
        value: ownerId,
        expiresAt: new Date(Date.now() + 3600000),
      },
    ])
    .run();
});

afterEach(async () => {
  cryptoGates.hashing = undefined;
  cryptoGates.hashed = undefined;
  cryptoGates.verified = undefined;
  connection?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

function snapshot() {
  return {
    users: connection.db.select().from(user).all(),
    accounts: connection.db.select().from(account).all(),
    sessions: connection.db.select().from(session).all(),
    verifications: connection.db.select().from(verification).all(),
  };
}

function login(loginPassword = password) {
  return auth.handler(
    new Request(`${origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        'x-forwarded-for': `198.51.100.${++requestIp}`,
      },
      body: JSON.stringify({ email, password: loginPassword }),
    }),
  );
}

async function signIn() {
  const response = await login();
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

function owner(cookie: string) {
  return auth.api.getSession({
    headers: new Headers({ cookie }),
    query: { disableRefresh: true },
  });
}

function terminal(dataDirectory = directory, args: string[] = []) {
  return startTerminal([process.execPath, packaged, ...args], {
    cwd: directory,
    // Recovery succeeds without deployment secrets, SMTP config or Web runtime.
    env: {
      PATH: dirname(process.execPath),
      NODE_ENV: 'test',
      DATA_DIR: dataDirectory,
    },
  });
}

async function enterPassword(
  run: ReturnType<typeof terminal>,
  confirmation = cliPassword,
  newPassword = cliPassword,
) {
  await run.waitFor('新密码：');
  run.write(`${newPassword}\r`);
  await run.waitFor('确认新密码：');
  run.write(`${confirmation}\r`);
  const result = await run.result;
  expect(result.terminalRestored, run.output()).toBe(true);
  expect(run.output()).not.toContain(newPassword);
  expect(run.output()).not.toContain(confirmation);
  return result;
}

it('shipped standalone CLI resets without Web, SMTP, secrets or repository dependencies', async () => {
  const cookies = [await signIn(), await signIn()];
  const before = snapshot();
  const run = terminal();
  try {
    expect((await enterPassword(run)).exitCode).toBe(0);
    expect(run.output()).toContain('全部会话已撤销，请重新登录');
    expect(snapshot().users).toEqual(before.users);
    expect(connection.db.select().from(session).all()).toEqual([]);
    expect(connection.db.select().from(verification).all()).toEqual(
      before.verifications.filter((row) =>
        row.identifier.startsWith('oauth-state:'),
      ),
    );
    for (const cookie of cookies) expect(await owner(cookie)).toBeNull();
    expect((await login()).status).toBe(401);
    expect((await login(cliPassword)).status).toBe(200);
  } finally {
    await run.stop();
  }
});

it('a running standalone Web process rejects both old cookies on the next request after CLI reset', async () => {
  const port = await unusedPort();
  const webOrigin = `http://127.0.0.1:${port}`;
  connection.db.update(siteSettings).set({ publicUrl: webOrigin }).run();
  await mkdir(join(directory, 'storage'));
  prepareInitialStorage(connection.db, { storage: join(directory, 'storage') });
  const server = await launch(packageDirectory, directory, {
    PORT: String(port),
    DATA_DIR: directory,
    HOST: '127.0.0.1',
  });
  const request = (path: string, init: RequestInit = {}) =>
    fetch(`${webOrigin}/api/auth/${path}`, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
  const webLogin = (value: string) =>
    request('sign-in/email', {
      method: 'POST',
      headers: {
        origin: webOrigin,
        'content-type': 'application/json',
        'x-forwarded-for': `198.51.100.${++requestIp}`,
      },
      body: JSON.stringify({ email, password: value }),
    });
  const run = terminal();
  try {
    await vi.waitFor(
      async () => {
        if (server.child.exitCode !== null) throw new Error(server.logs());
        expect(
          (
            await fetch(`${webOrigin}/api/health`, {
              signal: AbortSignal.timeout(1000),
            })
          ).status,
        ).toBe(200);
      },
      { timeout: 15000 },
    );
    const cookies: string[] = [];
    for (let i = 0; i < 2; i++) {
      const response = await webLogin(password);
      expect(response.status, await response.clone().text()).toBe(200);
      cookies.push(
        response.headers
          .getSetCookie()
          .map((cookie) => cookie.split(';')[0])
          .join('; '),
      );
    }
    for (const cookie of cookies)
      expect(
        await (await request('get-session', { headers: { cookie } })).json(),
      ).toHaveProperty('user.id', ownerId);
    expect(connection.db.select().from(session).all()).toHaveLength(2);
    expect((await enterPassword(run)).exitCode).toBe(0);
    for (const cookie of cookies)
      expect(
        await (await request('get-session', { headers: { cookie } })).json(),
      ).toBeNull();
    expect((await webLogin(password)).status).toBe(401);
    expect((await webLogin(cliPassword)).status).toBe(200);
  } finally {
    await run.stop();
    await stop(server.child, server.closed);
  }
}, 30000);

it.each(['session', 'verification'])(
  'CLI %s deletion failure rolls back password, sessions and unused resets',
  async (table) => {
    const cookies = [await signIn(), await signIn()];
    const before = snapshot();
    connection.db.$client.exec(
      `CREATE TRIGGER reject_cli_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, 'injected CLI transaction failure'); END`,
    );
    const run = terminal();
    try {
      expect((await enterPassword(run)).exitCode).toBe(1);
      expect(run.output()).toContain('injected CLI transaction failure');
      expect(run.output()).not.toContain('密码已重置');
      expect(run.output()).not.toContain(before.accounts[0].password!);
      expect(snapshot()).toEqual(before);
      for (const cookie of cookies) expect(await owner(cookie)).not.toBeNull();
      expect((await login()).status).toBe(200);
      expect((await login(cliPassword)).status).toBe(401);
    } finally {
      await run.stop();
      connection.db.$client.exec('DROP TRIGGER reject_cli_delete');
    }
    // The failed attempt remains recoverable through another explicit CLI run.
    const retry = terminal();
    try {
      expect((await enterPassword(retry)).exitCode).toBe(0);
      expect((await login(cliPassword)).status).toBe(200);
    } finally {
      await retry.stop();
    }
  },
);

it.each(
  ['first', 'confirmation'].flatMap((prompt) => [
    { prompt, signal: 'SIGINT', status: 130 },
    { prompt, signal: 'SIGTERM', status: 143 },
    { prompt, signal: 'Ctrl-C', status: 130 },
    { prompt, signal: 'EOF', status: 1 },
  ]),
)(
  'CLI $signal during $prompt input leaves rows intact and restores the terminal',
  async ({ prompt, signal, status }) => {
    await signIn();
    const before = snapshot();
    const run = terminal();
    try {
      await run.waitFor('新密码：');
      if (prompt === 'confirmation') {
        run.write(`${cliPassword}\r`);
        await run.waitFor('确认新密码：');
      }
      if (signal === 'EOF') run.write('\u0004');
      else {
        run.write(cliPassword);
        if (signal === 'Ctrl-C') run.write('\u0003');
        else run.signal(signal);
      }
      expect(await run.result).toEqual({
        exitCode: status,
        terminalRestored: true,
      });
      expect(run.output()).toContain(
        signal === 'EOF' ? '输入已关闭' : '已取消',
      );
      expect(run.output()).not.toContain(cliPassword);
      expect(snapshot()).toEqual(before);
      const reopened = openRuntimeDatabase(databasePath);
      try {
        reopened.db.transaction(() => {}, { behavior: 'immediate' });
      } finally {
        reopened.close();
      }
    } finally {
      await run.stop();
    }
  },
);

it('a competing SQLite writer cannot make CLI commit after cancellation', async () => {
  await signIn();
  const before = snapshot();
  const run = terminal();
  let lockHeld = false;
  try {
    await run.waitFor('新密码：');
    connection.db.$client.exec('BEGIN IMMEDIATE');
    lockHeld = true;
    run.write(`${cliPassword}\r`);
    await run.waitFor('确认新密码：');
    run.write(`${cliPassword}\r`);
    // The CLI must fail promptly on contention; a synchronous SQLite wait
    // prevents signal callbacks from running before the password transaction.
    const finished = await Promise.race([
      run.result.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500)),
    ]);
    if (!finished) {
      run.signal('SIGTERM');
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
    }
    connection.db.$client.exec('ROLLBACK');
    lockHeld = false;
    const result = await run.result;
    expect(result.terminalRestored, run.output()).toBe(true);
    expect(result.exitCode, run.output()).not.toBe(0);
    expect(run.output()).not.toContain('密码已重置');
    expect(run.output()).not.toContain(cliPassword);
    expect(snapshot()).toEqual(before);
  } finally {
    if (lockHeld) connection.db.$client.exec('ROLLBACK');
    await run.stop();
  }
});

it('CLI rejects confirmation mismatch without writes or password disclosure', async () => {
  const before = snapshot();
  const run = terminal();
  try {
    expect((await enterPassword(run, 'different-password')).exitCode).toBe(1);
    expect(run.output()).toContain('两次输入的密码不一致');
    expect(run.output()).not.toContain('密码已重置');
    expect(snapshot()).toEqual(before);
  } finally {
    await run.stop();
  }
});

it.each([7, 8, 128, 129])(
  'CLI validates a %i-character password at the 8–128 boundary',
  async (length) => {
    const value = 'p'.repeat(length);
    const before = snapshot();
    const run = terminal();
    try {
      const result = await enterPassword(run, value, value);
      const valid = length >= 8 && length <= 128;
      expect(result.exitCode).toBe(valid ? 0 : 1);
      if (valid) expect((await login(value)).status).toBe(200);
      else {
        expect(snapshot()).toEqual(before);
        expect(run.output()).not.toContain('密码已重置');
      }
    } finally {
      await run.stop();
    }
  },
);

it.each(['missing', 'empty'])(
  'CLI refuses a %s database without creating or migrating it',
  async (state) => {
    const unavailable = join(directory, state);
    const path = join(unavailable, 'ariso.db');
    await mkdir(unavailable);
    if (state === 'empty') await writeFile(path, '');
    const run = terminal(unavailable);
    try {
      expect(await run.result).toEqual({ exitCode: 1, terminalRestored: true });
      expect(run.output()).not.toContain('新密码：');
      if (state === 'missing')
        await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
      else expect(await readFile(path)).toEqual(Buffer.alloc(0));
    } finally {
      await run.stop();
    }
  },
);

it('CLI rejects arguments before reading input, without printing their values', async () => {
  const before = snapshot();
  const run = terminal(directory, ['--password', cliPassword]);
  try {
    expect(await run.result).toEqual({ exitCode: 1, terminalRestored: true });
    expect(run.output()).not.toContain('新密码：');
    expect(run.output()).not.toContain(cliPassword);
    expect(snapshot()).toEqual(before);
  } finally {
    await run.stop();
  }
});

it('CLI refuses an uninitialized database without migration, owner or initialization code', async () => {
  connection.db.delete(user).run();
  const before = snapshot();
  const schema = connection.db.$client
    .prepare('SELECT sql FROM sqlite_master ORDER BY name')
    .all();
  const run = terminal();
  try {
    expect(await run.result).toEqual({ exitCode: 1, terminalRestored: true });
    expect(run.output()).toContain('未初始化，请先完成 setup');
    expect(run.output()).not.toContain('新密码：');
    expect(snapshot()).toEqual(before);
    expect(
      connection.db.$client
        .prepare('SELECT sql FROM sqlite_master ORDER BY name')
        .all(),
    ).toEqual(schema);
  } finally {
    await run.stop();
  }
});

it('CLI uses the standard terminal editor for hidden Unicode password input', async () => {
  const unicodePassword = '恢复密码-identity-146';
  const run = terminal();
  try {
    await run.waitFor('新密码：');
    run.write(`${unicodePassword}错\u007f\r`);
    await run.waitFor('确认新密码：');
    run.write(`${unicodePassword}\r`);
    expect(await run.result).toEqual({ exitCode: 0, terminalRestored: true });
    expect(run.output()).not.toContain(unicodePassword);
    expect((await login(unicodePassword)).status).toBe(200);
  } finally {
    await run.stop();
  }
});

it('CLI hashes outside the writer transaction and an abort during hashing prevents every write', async () => {
  const before = snapshot();
  const reached = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  const cancellation = new AbortController();
  cryptoGates.hashing = () =>
    expect(connection.db.$client.inTransaction).toBe(false);
  cryptoGates.hashed = async () => {
    expect(connection.db.$client.inTransaction).toBe(false);
    reached.resolve();
    await resume.promise;
  };
  const pending = resetCliPassword(
    connection.db,
    cliPassword,
    cliPassword,
    cancellation.signal,
  );
  try {
    await reached.promise;
    const other = openRuntimeDatabase(databasePath);
    try {
      other.db.transaction(() => {}, { behavior: 'immediate' });
    } finally {
      other.close();
    }
    cancellation.abort(new Error('cancelled while hashing'));
  } finally {
    resume.resolve();
  }
  await expect(pending).rejects.toThrow('cancelled while hashing');
  expect(snapshot()).toEqual(before);
});

it('CLI commits after Web has verified its old password, so Web cannot overwrite the recovery', async () => {
  const cookies = [await signIn(), await signIn()];
  const current = await owner(cookies[0]);
  expect(current).not.toBeNull();
  const reached = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  cryptoGates.verified = async () => {
    reached.resolve();
    await resume.promise;
  };
  const pending = updateOwnerPassword(connection.db, current!, {
    currentPassword: password,
    newPassword: webPassword,
    confirmPassword: webPassword,
  });
  const run = terminal();
  try {
    await reached.promise;
    expect((await enterPassword(run)).exitCode).toBe(0);
  } finally {
    resume.resolve();
    cryptoGates.verified = undefined;
    await run.stop();
  }
  await expect(pending).rejects.toMatchObject({
    code: 'ACCOUNT_PASSWORD_CHANGED',
    status: 409,
  });
  for (const cookie of cookies) expect(await owner(cookie)).toBeNull();
  expect(connection.db.select().from(session).all()).toEqual([]);
  expect((await login()).status).toBe(401);
  expect((await login(webPassword)).status).toBe(401);
  expect((await login(cliPassword)).status).toBe(200);
});

it('Web commits while CLI is collecting input, then CLI becomes the final password and revokes every session', async () => {
  const cookies = [await signIn(), await signIn()];
  const current = await owner(cookies[0]);
  expect(current).not.toBeNull();
  const run = terminal();
  try {
    await run.waitFor('新密码：');
    await expect(
      updateOwnerPassword(connection.db, current!, {
        currentPassword: password,
        newPassword: webPassword,
        confirmPassword: webPassword,
      }),
    ).resolves.toEqual({ code: 'ACCOUNT_PASSWORD_UPDATED' });
    expect(await owner(cookies[0])).not.toBeNull();
    expect(await owner(cookies[1])).toBeNull();
    expect((await login(webPassword)).status).toBe(200);
    expect((await enterPassword(run)).exitCode).toBe(0);
    expect(connection.db.select().from(session).all()).toEqual([]);
    for (const cookie of cookies) expect(await owner(cookie)).toBeNull();
    expect((await login(webPassword)).status).toBe(401);
    expect((await login(cliPassword)).status).toBe(200);
  } finally {
    await run.stop();
  }
});
