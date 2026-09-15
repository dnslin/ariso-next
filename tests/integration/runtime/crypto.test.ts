import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db';

let directory: string;
let key: string;
let authSecret: string;
const plaintext = 'disk-only test secret 密码';

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-crypto-'));
  key = randomBytes(32).toString('hex');
  authSecret = randomBytes(32).toString('hex');
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

const moduleUrl = (name: string) =>
  JSON.stringify(
    new URL(`../../../src/server/runtime/${name}.ts`, import.meta.url).href,
  );

// 测试表和读写流程仅存在于测试子进程，生产模块不拥有秘密表。
const source = `
  import assert from 'node:assert/strict';
  import { sql } from 'drizzle-orm';
  import { parseRuntimeEnv } from ${moduleUrl('env')};
  import { openRuntimeDatabase } from ${moduleUrl('db')};
  import { createSecretCrypto } from ${moduleUrl('crypto')};
  const config = parseRuntimeEnv();
  const crypto = createSecretCrypto(config.encryptionKey);
  const { db, close } = openRuntimeDatabase(process.argv[1]);
  try {
    if (process.argv[2] === 'empty') {
      assert.deepEqual(db.all(sql\`SELECT name FROM sqlite_master WHERE type = 'table'\`), []);
    } else if (process.argv[2] === 'write') {
      db.run(sql\`CREATE TABLE crypto_sample (id TEXT PRIMARY KEY, secret TEXT)\`);
      db.run(sql\`INSERT INTO crypto_sample VALUES ('configured', \${crypto.encryptSecret(process.env.TEST_PLAINTEXT)})\`);
      db.run(sql\`INSERT INTO crypto_sample VALUES ('unconfigured', NULL)\`);
    } else {
      const rows = db.all(sql\`SELECT id, secret FROM crypto_sample ORDER BY id\`);
      assert.equal(rows.length, 2);
      assert.equal(crypto.decryptSecret(rows[0].secret, 'storage/configured/secretKey'), process.env.TEST_PLAINTEXT);
      assert.equal(rows[1].secret, null);
    }
    console.log('verified');
  } finally { close(); }
`;

function run(
  mode: 'empty' | 'write' | 'read',
  encryptionKey = key,
  betterAuthSecret = authSecret,
) {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', source, join(directory, 'ariso.db'), mode],
    {
      cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      env: {
        ...process.env,
        DATA_DIR: directory,
        ARISO_ENCRYPTION_KEY: encryptionKey,
        BETTER_AUTH_SECRET: betterAuthSecret,
        TEST_PLAINTEXT: plaintext,
      },
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  if (result.error) throw result.error;
  return result;
}

function expectSuccess(result: ReturnType<typeof run>) {
  expect(result.status, result.stderr).toBe(0);
  expect(result.signal).toBeNull();
  expect(result.stdout.trim()).toBe('verified');
}

function snapshot() {
  const { db, close } = openRuntimeDatabase(join(directory, 'ariso.db'));
  try {
    return {
      tables: db.all(
        sql`SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name`,
      ),
      rows: db.all<{ id: string; secret: string | null }>(
        sql`SELECT id, secret FROM crypto_sample ORDER BY id`,
      ),
    };
  } finally {
    close();
  }
}

describe('persisted secret crypto', () => {
  it('空磁盘数据库接受不同的有效部署密钥，始终不创建密钥校验表或记录', () => {
    expectSuccess(run('empty'));
    expectSuccess(run('empty', randomBytes(32).toString('hex')));
    const { db, close } = openRuntimeDatabase(join(directory, 'ariso.db'));
    try {
      expect(
        db.all(sql`SELECT name FROM sqlite_master WHERE type = 'table'`),
      ).toEqual([]);
    } finally {
      close();
    }
  });

  it('写入进程退出后另一进程解密原记录，认证密钥变更不影响解密且 null 保持未配置', () => {
    expectSuccess(run('write'));
    const before = snapshot();
    expect(before.tables).toHaveLength(1);
    expect(before.tables[0]).toMatchObject({ name: 'crypto_sample' });
    expect(before.rows[0].secret).not.toContain(plaintext);
    expectSuccess(run('read', key, randomBytes(32).toString('hex')));
    expect(snapshot()).toEqual(before);
  });

  it.each(['wrong key', 'tampered ciphertext', 'invalid ciphertext'])(
    '读取 %s 明确失败，重开数据库后所有原记录和表不变',
    (fault) => {
      expectSuccess(run('write'));
      const original = snapshot().rows[0].secret!;
      if (fault !== 'wrong key') {
        const payload = Buffer.from(original, 'base64');
        payload[28] ^= 1;
        const damaged =
          fault === 'invalid ciphertext'
            ? 'invalid ciphertext!'
            : payload.toString('base64');
        const { db, close } = openRuntimeDatabase(join(directory, 'ariso.db'));
        try {
          db.run(
            sql`UPDATE crypto_sample SET secret = ${damaged} WHERE id = 'configured'`,
          );
        } finally {
          close();
        }
      }
      const before = snapshot();
      const readKey =
        fault === 'wrong key' ? randomBytes(32).toString('hex') : key;
      const result = run('read', readKey);
      expect(result.status).toBe(1);
      expect(result.signal).toBeNull();
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('storage/configured/secretKey');
      expect(result.stderr).toContain(
        fault === 'invalid ciphertext' ? '密文格式无效' : '密文认证失败',
      );
      for (const secret of [
        plaintext,
        original,
        before.rows[0].secret!,
        key,
        readKey,
        authSecret,
      ]) {
        expect(result.stderr).not.toContain(secret);
      }
      expect(before.tables).toHaveLength(1);
      expect(before.rows).toHaveLength(2);
      expect(snapshot()).toEqual(before);
      if (fault === 'wrong key') {
        expectSuccess(run('read'));
        expect(snapshot()).toEqual(before);
      }
    },
  );
});
