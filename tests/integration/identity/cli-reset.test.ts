import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { execa } from 'execa';
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
import { resetCliPassword } from '../../experiments/identity/cli-password.ts';
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
let build: string;
let directory: string;
let databasePath: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let auth: NonNullable<ReturnType<typeof getAuth>>;
let ownerId: string;
let requestIp = 0;

beforeAll(async () => {
  await mkdir(join(root, 'test-results'), { recursive: true });
  build = await mkdtemp(join(root, 'test-results/identity-cli-'));
  const compiled = join(build, 'compiled');
  await execa(
    process.execPath,
    [
      resolve('node_modules/typescript/bin/tsc'),
      '--ignoreConfig',
      '--target',
      'ES2023',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--rootDir',
      root,
      '--outDir',
      compiled,
      '--skipLibCheck',
      '--strict',
      '--esModuleInterop',
      '--rewriteRelativeImportExtensions',
      '--types',
      'node',
      resolve('tests/experiments/identity/cli-reset.ts'),
    ],
    { cwd: root },
  );
  const entry = join(compiled, 'tests/experiments/identity/cli-reset.js');
  const nft = createRequire(import.meta.url)(
    'next/dist/compiled/@vercel/nft/index.js',
  ) as {
    nodeFileTrace: (
      entries: string[],
      options: { base: string; processCwd: string },
    ) => Promise<{ fileList: Set<string>; warnings: Set<Error> }>;
  };
  const traced = await nft.nodeFileTrace([entry], {
    base: root,
    processCwd: root,
  });
  // The driver ships prebuilds; the tracer also probes its optional Debug path.
  for (const warning of traced.warnings)
    expect(String(warning)).toContain(
      'better-sqlite3/build/Debug/better_sqlite3.node',
    );
  expect(
    [...traced.fileList].some(
      (file) =>
        file.includes('better-sqlite3/prebuilds/') && file.endsWith('.node'),
    ),
  ).toBe(true);
  packageDirectory = await mkdtemp(join(tmpdir(), 'ariso-cli-standalone-'));
  for (const file of traced.fileList) {
    if (file === 'package.json') continue;
    const source = join(root, file);
    const destination = join(packageDirectory, file);
    await mkdir(dirname(destination), { recursive: true });
    if ((await lstat(source)).isSymbolicLink()) {
      const link = await readlink(source);
      await symlink(
        relative(dirname(source), resolve(dirname(source), link)),
        destination,
      );
    } else await copyFile(source, destination);
  }
  await writeFile(
    join(packageDirectory, 'package.json'),
    '{"type":"module"}\n',
  );
  packaged = join(packageDirectory, relative(root, entry));
}, 30000);

afterAll(async () => {
  if (packageDirectory)
    await rm(packageDirectory, {
      recursive: true,
      force: true,
    });
  if (build) await rm(build, { recursive: true, force: true });
});

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-cli-reset-'));
  databasePath = join(directory, 'identity.sqlite');
  connection = openRuntimeDatabase(databasePath);
  migrate(connection.db, { migrationsFolder: resolve('drizzle') });
  ownerId = await seedAuthOwner(connection, origin);
  auth = getAuth({
    connection,
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

function terminal(path = packaged, dbPath = databasePath) {
  const child = spawn(
    '/usr/bin/python3',
    [
      resolve('tests/experiments/identity/cli-terminal.py'),
      process.execPath,
      path,
      dbPath,
    ],
    {
      cwd: directory,
      // Recovery succeeds without deployment secrets, SMTP config or Web runtime.
      env: { PATH: dirname(process.execPath), NODE_ENV: 'test' },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  let output = '';
  let buffered = '';
  let diagnostics = '';
  const result = Promise.withResolvers<{
    exitCode: number;
    terminalRestored: boolean;
  }>();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffered += chunk;
    for (let newline; (newline = buffered.indexOf('\n')) >= 0;) {
      const message = JSON.parse(buffered.slice(0, newline));
      buffered = buffered.slice(newline + 1);
      if ('output' in message) output += message.output;
      else result.resolve(message);
    }
  });
  child.stderr.on('data', (chunk) => (diagnostics += chunk));
  child.on('error', result.reject);
  child.on('close', (code) => {
    if (code !== 0)
      result.reject(new Error(diagnostics || `PTY exited ${code}`));
  });
  return {
    output: () => output,
    write: (input: string) =>
      child.stdin.write(JSON.stringify({ input }) + '\n'),
    signal: (signal: string) =>
      child.stdin.write(JSON.stringify({ signal }) + '\n'),
    async waitFor(text: string) {
      await vi.waitFor(() => expect(output).toContain(text), {
        timeout: 10000,
      });
    },
    result: result.promise,
    async stop() {
      if (child.exitCode === null) child.stdin.end();
      await result.promise;
    },
  };
}

async function enterPassword(
  run: ReturnType<typeof terminal>,
  confirmation = cliPassword,
) {
  await run.waitFor('新密码：');
  run.write(`${cliPassword}\r`);
  await run.waitFor('确认新密码：');
  run.write(`${confirmation}\r`);
  const result = await run.result;
  expect(result.terminalRestored, run.output()).toBe(true);
  expect(run.output()).not.toContain(cliPassword);
  return result;
}

it('compiled and traced CLI resets from an unrelated cwd without Web, SMTP, migration or initialization', async () => {
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

it.each([
  { signal: 'SIGINT', status: 130 },
  { signal: 'SIGTERM', status: 143 },
  { signal: 'Ctrl-C', status: 130 },
])(
  'CLI $signal cancellation leaves all rows intact and restores the terminal',
  async ({ signal, status }) => {
    await signIn();
    const before = snapshot();
    const run = terminal();
    try {
      await run.waitFor('新密码：');
      run.write(cliPassword);
      if (signal === 'Ctrl-C') run.write('\u0003');
      else run.signal(signal);
      const result = await run.result;
      expect(result).toEqual({ exitCode: status, terminalRestored: true });
      expect(run.output()).toContain('已取消');
      expect(run.output()).not.toContain(cliPassword);
      expect(snapshot()).toEqual(before);
      // Another connection obtains the writer immediately after cancellation.
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

it.each(['confirmation mismatch', 'EOF'])(
  'CLI %s exits without writes and restores terminal settings',
  async (failure) => {
    const before = snapshot();
    const run = terminal();
    try {
      await run.waitFor('新密码：');
      if (failure === 'confirmation mismatch')
        expect((await enterPassword(run, 'different-password')).exitCode).toBe(
          1,
        );
      else {
        run.write('\u0004');
        expect(await run.result).toEqual({
          exitCode: 1,
          terminalRestored: true,
        });
        expect(run.output()).toContain('输入已关闭');
      }
      expect(snapshot()).toEqual(before);
      expect(run.output()).not.toContain('密码已重置');
    } finally {
      await run.stop();
    }
  },
);

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
    run.write(`${unicodePassword}x\u007f\r`);
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
