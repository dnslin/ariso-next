import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  initialMigration,
  upgradeMigration,
  brokenMigration,
  writeMigrations,
} from '../../fixtures/runtime/migrations';
import { launch, stop, unusedPort } from './process-helpers';

let root: string;
let app: string;
let directory: string;
let env: Record<string, string>;
let runs: Awaited<ReturnType<typeof launch>>[];

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'ariso-startup-'));
  app = join(root, 'app');
  await cp(resolve('.next/standalone'), app, {
    recursive: true,
    verbatimSymlinks: true,
  });
}, 30000);
beforeEach(async () => {
  directory = await mkdtemp(join(root, 'case-'));
  env = {
    HOST: '127.0.0.1',
    PORT: String(await unusedPort()),
    DATA_DIR: join(directory, 'data'),
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  };
  runs = [];
  await rm(join(app, 'drizzle'), { recursive: true });
  writeMigrations(join(app, 'drizzle'), []);
});
afterEach(async () => {
  try {
    for (const run of runs) await stop(run.child, run.closed);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function start(overrides: Record<string, string | undefined> = {}) {
  const run = await launch(app, directory, { ...env, ...overrides });
  runs.push(run);
  return run;
}

async function listening(port: number) {
  return new Promise<boolean>((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(500, () => {
      socket.destroy();
      reject(new Error(`TCP probe timed out: ${port}`));
    });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNREFUSED') resolve(false);
      else reject(error);
    });
  });
}

async function failed(
  run: Awaited<ReturnType<typeof launch>>,
  prestart = true,
) {
  const deadline = Date.now() + 10000;
  // 从启动后立即采样到退出之后；不能只在进程退出后检查一次端口。
  do {
    if (prestart)
      expect(await listening(Number(env.PORT)), run.logs()).toBe(false);
    if (run.child.exitCode !== null || run.child.signalCode !== null) break;
    if (Date.now() > deadline)
      throw new Error(`Entry did not exit:\n${run.logs()}`);
    await delay(10);
  } while (true);
  const [code, signal] = await run.closed;
  expect(signal, run.logs()).toBeNull();
  expect(code, run.logs()).toBe(1);
  if (prestart) {
    expect(await listening(Number(env.PORT)), run.logs()).toBe(false);
    expect(run.logs()).toContain('prestart failed:');
    expect(JSON.parse(run.logs())).toMatchObject({
      module: 'runtime.prestart',
      level: 'fatal',
      phase: 'prestart',
      err: {
        type: expect.any(String),
        message: expect.any(String),
        stack: expect.any(String),
      },
    });
    expect(run.logs()).not.toContain('Next.js');
  }
  for (const key of ['BETTER_AUTH_SECRET', 'ARISO_ENCRYPTION_KEY']) {
    expect(run.logs()).not.toContain(env[key]);
  }
}

async function healthy() {
  const run = await start();
  await expect
    .poll(
      async () => {
        if (run.child.exitCode !== null) throw new Error(run.logs());
        try {
          return (
            await fetch(`http://127.0.0.1:${env.PORT}/api/health`, {
              signal: AbortSignal.timeout(1000),
            })
          ).status;
        } catch {
          return 0;
        }
      },
      { timeout: 15000 },
    )
    .toBe(200);
  return run;
}

async function stopped(run: Awaited<ReturnType<typeof launch>>) {
  await stop(run.child, run.closed);
  // Next 16 的默认 SIGTERM 清理以 128 + 15 退出。
  expect(await run.closed, run.logs()).toEqual([143, null]);
  expect(await listening(Number(env.PORT))).toBe(false);
}

function query(sql: string) {
  const db = new Database(join(env.DATA_DIR, 'ariso.db'), { readonly: true });
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
}

describe('完整生产入口的失败与恢复', () => {
  it.each([
    ['BETTER_AUTH_SECRET', undefined],
    ['BETTER_AUTH_SECRET', 'invalid-secret'],
    ['ARISO_ENCRYPTION_KEY', undefined],
    ['ARISO_ENCRYPTION_KEY', 'z'.repeat(64)],
    ['PORT', '0'],
    ['PORT', '65536'],
    ['PORT', '3.5'],
    ['PORT', 'abc'],
    ['LOG_LEVEL', 'invalid-secret-log-level'],
  ])(
    '%s=%s：拒绝配置且不监听，修复后同目录启动',
    async (key, value) => {
      const run = await start({ [key!]: value });
      await failed(run);
      expect(run.logs()).toContain(key);
      if (key !== 'PORT' && value) expect(run.logs()).not.toContain(value);
      await expect(
        readFile(join(env.DATA_DIR, 'ariso.db')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      await stopped(await healthy());
    },
    25000,
  );

  it('真实不可写目录保留权限、路径和文件，恢复写权限后启动', async () => {
    await mkdir(env.DATA_DIR);
    const marker = join(env.DATA_DIR, 'keep.txt');
    await writeFile(marker, 'keep');
    await chmod(env.DATA_DIR, 0o500);
    try {
      const run = await start();
      await failed(run);
      expect(run.logs()).toContain('EACCES');
      expect(run.logs()).toContain(env.DATA_DIR);
      expect(await readFile(marker, 'utf8')).toBe('keep');
      expect((await stat(env.DATA_DIR)).mode & 0o777).toBe(0o500);
    } finally {
      await chmod(env.DATA_DIR, 0o700);
    }
    await stopped(await healthy());
    expect(await readFile(marker, 'utf8')).toBe('keep');
  }, 25000);

  it('占用生产端口时退出而不换端口，释放后原端口可启动', async () => {
    const blocker = createServer((socket) => socket.end());
    blocker.listen(Number(env.PORT), env.HOST);
    await once(blocker, 'listening');
    try {
      const run = await start();
      await failed(run, false);
      expect(run.logs()).toContain('EADDRINUSE');
      const records = run
        .logs()
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(records).toContainEqual(
        expect.objectContaining({
          module: 'runtime.console',
          level: 'error',
          err: expect.objectContaining({ code: 'EADDRINUSE' }),
        }),
      );
      expect(run.logs()).not.toContain('Ready in');
      expect(blocker.listening).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) =>
        blocker.close((error) => (error ? reject(error) : resolve())),
      );
    }
    await stopped(await healthy());
  }, 25000);

  it('真实故障 SQL 阻止 Web 并回滚本批迁移，修复后不重放已提交迁移', async () => {
    const folder = writeMigrations(join(app, 'drizzle'), [initialMigration]);
    await stopped(await healthy());
    writeMigrations(folder, [
      initialMigration,
      upgradeMigration,
      brokenMigration,
    ]);
    const run = await start();
    await failed(run);
    for (const diagnostic of [
      'MIGRATION_FAILED',
      'apply',
      'current=1000',
      'SQLITE_ERROR',
      'missing_table',
      '0002_broken.sql',
      join(env.DATA_DIR, 'ariso.db'),
    ]) {
      expect(run.logs()).toContain(diagnostic);
    }
    expect(query('SELECT value FROM sample')).toEqual([{ value: 'original' }]);
    expect(
      query("SELECT name FROM sqlite_master WHERE name = 'rolled_back'"),
    ).toEqual([]);
    expect(query('SELECT created_at FROM __drizzle_migrations')).toEqual([
      { created_at: 1000 },
    ]);
    writeMigrations(folder, [
      initialMigration,
      upgradeMigration,
      { ...brokenMigration, sql: "INSERT INTO sample VALUES ('fixed');" },
    ]);
    for (let attempt = 0; attempt < 2; attempt++)
      await stopped(await healthy());
    expect(query('SELECT value FROM sample')).toEqual([
      { value: 'original' },
      { value: 'upgrade' },
      { value: 'fixed' },
    ]);
  }, 30000);

  it('旧产物拒绝新数据库且不降级，恢复新迁移集合后保留记录及临时文件', async () => {
    const folder = writeMigrations(join(app, 'drizzle'), [
      initialMigration,
      upgradeMigration,
    ]);
    const first = await healthy();
    const db = new Database(join(env.DATA_DIR, 'ariso.db'));
    try {
      db.prepare('INSERT INTO sample VALUES (?)').run('persisted-before-stop');
    } finally {
      db.close();
    }
    const marker = join(env.DATA_DIR, 'tmp', 'unfinished.txt');
    await writeFile(marker, 'unfinished');
    await stopped(first);
    const rows = query('SELECT value FROM sample');
    const progress = query('SELECT * FROM __drizzle_migrations');
    writeMigrations(folder, [initialMigration]);
    const old = await start();
    await failed(old);
    expect(old.logs()).toContain('SCHEMA_TOO_NEW');
    expect(old.logs()).toContain('current=2000');
    expect(old.logs()).toContain('latest=1000');
    expect(query('SELECT value FROM sample')).toEqual(rows);
    expect(query('SELECT * FROM __drizzle_migrations')).toEqual(progress);
    writeMigrations(folder, [initialMigration, upgradeMigration]);
    const restarted = await healthy();
    expect(query('SELECT value FROM sample')).toEqual([
      { value: 'original' },
      { value: 'upgrade' },
      { value: 'persisted-before-stop' },
    ]);
    expect(query('SELECT * FROM __drizzle_migrations')).toEqual(progress);
    expect(await readFile(marker, 'utf8')).toBe('unfinished');
    await stopped(restarted);
  }, 30000);
});
