import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createSecretCrypto } from '../../../src/server/runtime/crypto';
import { writeMigrations as writeRuntimeMigrations } from '../../fixtures/runtime/migrations';
import { launch, stop, unusedPort } from './process-helpers';

const storageMigration = {
  tag: '0000_storage',
  when: 1,
  sql: readFileSync(resolve('drizzle/0001_calm_hulk.sql'), 'utf8'),
};
function writeMigrations(
  ...[folder, migrations]: Parameters<typeof writeRuntimeMigrations>
) {
  const identityMigration = {
    tag: '0001_identity',
    when: 2,
    sql: readFileSync(resolve('drizzle/0004_shiny_korath.sql'), 'utf8'),
  };
  return writeRuntimeMigrations(folder, [
    storageMigration,
    identityMigration,
    {
      tag: '0002_upload',
      when: 3,
      sql: readFileSync(resolve('drizzle/0008_numerous_nick_fury.sql'), 'utf8'),
    },
    {
      tag: '0003_analytics',
      when: 4,
      sql: readFileSync(resolve('drizzle/0009_wide_scarlet_witch.sql'), 'utf8'),
    },
    ...migrations,
  ]);
}

let root: string;
let app: string;
let directory: string;
let env: Record<string, string>;
let runs: Awaited<ReturnType<typeof launch>>[];
const plaintext = 'persisted preflight test secret';
const migration = {
  tag: '0000_secret_sample',
  when: 1000,
  sql: 'CREATE TABLE secret_sample (id TEXT PRIMARY KEY, secret TEXT);',
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'ariso-secret-preflight-'));
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
  await cp(resolve('dist/cli/prestart.js'), join(app, 'dist/cli/prestart.js'));
  await rm(join(app, 'drizzle'), { recursive: true });
  writeMigrations(join(app, 'drizzle'), []);
});
afterEach(async () => {
  for (const run of runs) await stop(run.child, run.closed);
  await rm(directory, { recursive: true, force: true });
});
afterAll(async () => rm(root, { recursive: true, force: true }));

async function start(overrides: Record<string, string> = {}) {
  const run = await launch(app, directory, { ...env, ...overrides });
  runs.push(run);
  return run;
}
async function expectHealthy(run: Awaited<ReturnType<typeof launch>>) {
  await expect.poll(() => run.logs(), { timeout: 15000 }).toContain('Ready in');
  const response = await fetch(`http://127.0.0.1:${run.port}/api/health`, {
    signal: AbortSignal.timeout(2000),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
  await stop(run.child, run.closed);
}
function inspect() {
  const db = new Database(join(env.DATA_DIR, 'ariso.db'));
  try {
    return {
      tables: db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all(),
      migrations: db
        .prepare(
          'SELECT created_at FROM __drizzle_migrations ORDER BY created_at',
        )
        .all(),
      rows: db
        .prepare('SELECT id, secret FROM secret_sample ORDER BY id')
        .all(),
    };
  } finally {
    db.close();
  }
}

it('空生产数据库接受不同合法密钥，生产产物不包含测试表、组合或密钥校验记录', async () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    await expectHealthy(
      await start({ ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex') }),
    );
  }
  const db = new Database(join(env.DATA_DIR, 'ariso.db'));
  try {
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all(),
    ).toEqual([
      { name: '__drizzle_migrations' },
      { name: 'account' },
      { name: 'analytics_daily' },
      { name: 'analytics_image_daily' },
      { name: 'analytics_image_totals' },
      { name: 'session' },
      { name: 'storage_configs' },
      { name: 'storage_settings' },
      { name: 'upload_sessions' },
      { name: 'upload_settings' },
      { name: 'upload_submissions' },
      { name: 'user' },
      { name: 'verification' },
    ]);
    expect(
      db.prepare('SELECT created_at FROM __drizzle_migrations').all(),
    ).toEqual([
      { created_at: 1 },
      { created_at: 2 },
      { created_at: 3 },
      { created_at: 4 },
    ]);
  } finally {
    db.close();
  }
  const files = await readdir(app, { recursive: true });
  expect(files).not.toContain('tests');
  expect(files.some((file) => file.includes('secret-preflight'))).toBe(false);
}, 30000);

it.each(['wrong key', 'invalid ciphertext', 'tampered ciphertext'])(
  '%s 阻止入口启动 Web，保留已提交迁移与密文，修复后继续且不重放迁移',
  async (fault) => {
    writeMigrations(join(app, 'drizzle'), [migration]);
    await expectHealthy(await start());
    const crypto = createSecretCrypto(
      Buffer.from(env.ARISO_ENCRYPTION_KEY, 'hex'),
    );
    const original = crypto.encryptSecret(plaintext);
    const payload = Buffer.from(original, 'base64');
    payload[28] ^= 1;
    const saved =
      fault === 'invalid ciphertext'
        ? 'invalid ciphertext!'
        : fault === 'tampered ciphertext'
          ? payload.toString('base64')
          : original;
    const db = new Database(join(env.DATA_DIR, 'ariso.db'));
    try {
      db.prepare('INSERT INTO secret_sample VALUES (?, ?)').run(
        'configured',
        saved,
      );
      db.prepare('INSERT INTO secret_sample VALUES (?, ?)').run(
        'unconfigured',
        null,
      );
    } finally {
      db.close();
    }
    // 仅替换临时副本中的 CLI；入口脚本和标准 Next server.js 保持实际产物。
    const fixture = new URL(
      '../../fixtures/runtime/secret-preflight.ts',
      import.meta.url,
    ).href;
    await writeFile(
      join(app, 'dist/cli/prestart.js'),
      `import ${JSON.stringify(fixture)};\n`,
    );
    writeMigrations(join(app, 'drizzle'), [
      migration,
      {
        tag: '0001_upgrade',
        when: 2000,
        sql: "INSERT INTO secret_sample VALUES ('migration-committed', NULL);",
      },
    ]);
    const readKey =
      fault === 'wrong key'
        ? randomBytes(32).toString('hex')
        : env.ARISO_ENCRYPTION_KEY;
    const failed = await start({
      NODE_OPTIONS: '',
      ARISO_ENCRYPTION_KEY: readKey,
    });
    await expect.poll(() => failed.child.exitCode, { timeout: 10000 }).toBe(1);
    expect(await failed.closed).toEqual([1, null]);
    expect(failed.logs()).toContain('storage/configured/secretKey');
    expect(failed.logs()).toContain(
      fault === 'invalid ciphertext' ? '密文格式无效' : '密文认证失败',
    );
    expect(failed.logs()).not.toContain('secret-preflight-complete');
    expect(failed.logs()).not.toContain('Ready in');
    await expect(
      fetch(`http://127.0.0.1:${failed.port}/api/health`, {
        signal: AbortSignal.timeout(2000),
      }),
    ).rejects.toThrow();
    for (const secret of [
      plaintext,
      saved,
      original,
      readKey,
      env.ARISO_ENCRYPTION_KEY,
      env.BETTER_AUTH_SECRET,
    ]) {
      expect(failed.logs()).not.toContain(secret);
    }
    for (const suffix of ['-wal', '-shm']) {
      expect(existsSync(join(env.DATA_DIR, `ariso.db${suffix}`))).toBe(false);
    }
    const afterFailure = inspect();
    expect(afterFailure).toEqual({
      tables: [
        { name: '__drizzle_migrations' },
        { name: 'account' },
        { name: 'analytics_daily' },
        { name: 'analytics_image_daily' },
        { name: 'analytics_image_totals' },
        { name: 'secret_sample' },
        { name: 'session' },
        { name: 'storage_configs' },
        { name: 'storage_settings' },
        { name: 'upload_sessions' },
        { name: 'upload_settings' },
        { name: 'upload_submissions' },
        { name: 'user' },
        { name: 'verification' },
      ],
      migrations: [
        { created_at: 1 },
        { created_at: 2 },
        { created_at: 3 },
        { created_at: 4 },
        { created_at: 1000 },
        { created_at: 2000 },
      ],
      rows: [
        { id: 'configured', secret: saved },
        { id: 'migration-committed', secret: null },
        { id: 'unconfigured', secret: null },
      ],
    });
    if (fault !== 'wrong key') {
      const repair = new Database(join(env.DATA_DIR, 'ariso.db'));
      try {
        repair
          .prepare(
            "UPDATE secret_sample SET secret = ? WHERE id = 'configured'",
          )
          .run(original);
      } finally {
        repair.close();
      }
    }
    const repaired = inspect();
    for (let attempt = 0; attempt < 2; attempt++) {
      const recovered = await start({ NODE_OPTIONS: '' });
      await expectHealthy(recovered);
      expect(recovered.logs()).toContain('secret-preflight-complete');
      expect(inspect()).toEqual(repaired);
    }
  },
  60000,
);
