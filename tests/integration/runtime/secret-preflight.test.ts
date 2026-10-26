import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createSecretCrypto } from '../../../src/server/runtime/crypto';
import {
  readProductionMigrations,
  writeMigrations as writeRuntimeMigrations,
} from '../../fixtures/runtime/migrations';
import { launch, stop, unusedPort } from './process-helpers';

const productionMigrations = readProductionMigrations();
const productionHistory = productionMigrations.map(({ when }) => ({
  created_at: when,
}));
const productionTableNames = [
  '__drizzle_migrations',
  'access_protection_settings',
  'account',
  'album_images',
  'album_shares',
  'albums',
  'analytics_daily',
  'analytics_image_daily',
  'analytics_image_totals',
  'apikey',
  'identity_github_settings',
  'identity_smtp_settings',
  'image_shares',
  'image_tags',
  'media_cleanup_jobs',
  'media_edit_requests',
  'media_edit_templates',
  'media_images',
  'media_jobs',
  'media_metadata',
  'media_objects',
  'media_previews',
  'media_replacements',
  'media_settings',
  'media_size_candidates',
  'media_size_requests',
  'media_size_versions',
  'media_versions',
  'media_watermark_assets',
  'media_watermark_preview_refs',
  'session',
  'share_grants',
  'site_settings',
  'smart_collections',
  'storage_configs',
  'storage_orphans',
  'storage_probes',
  'storage_scans',
  'storage_settings',
  'tags',
  'upload_sessions',
  'upload_settings',
  'upload_submissions',
  'user',
  'verification',
];
function writeMigrations(
  ...[folder, migrations]: Parameters<typeof writeRuntimeMigrations>
) {
  return writeRuntimeMigrations(folder, [
    ...productionMigrations,
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
async function expectHealthy(
  run: Awaited<ReturnType<typeof launch>>,
  phase: string,
) {
  const startedAt = Date.now();
  let step = 'waiting for HTTP readiness';
  try {
    // Next logs Ready before initializing handlers. Keep the startup budget,
    // but wait for the actual HTTP endpoint rather than that early log line.
    await expect
      .poll(
        async () => {
          step = 'requesting /api/health';
          const response = await fetch(
            `http://127.0.0.1:${run.port}/api/health`,
            {
              signal: AbortSignal.timeout(2000),
            },
          );
          step = 'reading /api/health';
          expect(response.status).toBe(200);
          return response.json();
        },
        { timeout: 15000 },
      )
      .toEqual({ status: 'ok' });
    expect(run.logs()).toContain('Ready in');
    step = 'stopping server';
    await stop(run.child, run.closed);
  } catch (cause) {
    throw new Error(
      `${phase}: ${step} failed after ${Date.now() - startedAt}ms\n` +
        `pid=${run.child.pid}, port=${run.port}, exitCode=${run.child.exitCode}, signalCode=${run.child.signalCode}\n` +
        `stdout:\n${run.stdout()}\nstderr:\n${run.stderr()}`,
      { cause },
    );
  }
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
      `empty database start ${attempt + 1}`,
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
    ).toEqual(productionTableNames.map((name) => ({ name })));
    expect(
      db.prepare('SELECT created_at FROM __drizzle_migrations').all(),
    ).toEqual(productionHistory);
  } finally {
    db.close();
  }
  const files = await readdir(app, { recursive: true });
  expect(files).not.toContain('tests');
  expect(files.some((file) => file.includes('secret-preflight'))).toBe(false);
}, 30000);

it('waits for HTTP readiness after the framework startup log', async () => {
  const preload = join(directory, 'delay-router.cjs');
  // Delay the real router in this isolated process after Next prints Ready.
  await writeFile(
    preload,
    `const Module = require('node:module');
const load = Module._load;
Module._load = function (id, ...args) {
  const loaded = load.call(this, id, ...args);
  if (id !== './router-server') return loaded;
  return { ...loaded, async initialize(...options) {
    console.info('test: delaying router initialization');
    await new Promise(resolve => setTimeout(resolve, 2500));
    return loaded.initialize(...options);
  } };
};\n`,
  );
  const run = await start({
    NODE_OPTIONS: `--require ${JSON.stringify(preload)}`,
  });
  await expectHealthy(run, 'delayed HTTP readiness');
  expect(run.logs()).toContain('test: delaying router initialization');
}, 30000);

it.each(['wrong key', 'invalid ciphertext', 'tampered ciphertext'])(
  '%s 阻止入口启动 Web，保留已提交迁移与密文，修复后继续且不重放迁移',
  async (fault) => {
    writeMigrations(join(app, 'drizzle'), [migration]);
    await expectHealthy(await start(), `${fault}: initial start`);
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
      tables: [...productionTableNames, 'secret_sample']
        .sort()
        .map((name) => ({ name })),
      migrations: [
        ...productionHistory,
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
      await expectHealthy(recovered, `${fault}: repaired start ${attempt + 1}`);
      expect(recovered.logs()).toContain('secret-preflight-complete');
      expect(inspect()).toEqual(repaired);
    }
  },
  60000,
);
