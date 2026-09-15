import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createSecretCrypto } from '../../../src/server/runtime/crypto';
import { parseRuntimeEnv } from '../../../src/server/runtime/env';

describe('runtime secret crypto', () => {
  it.each(['secret', '密钥 🔑\0\n', '', ' \t\n'])(
    '按 UTF-8 无损往返 %j，相同明文使用不同 nonce',
    (plaintext) => {
      const key = randomBytes(32);
      const crypto = createSecretCrypto(key);
      const first = crypto.encryptSecret(plaintext);
      const second = crypto.encryptSecret(plaintext);
      expect(first).not.toBe(second);
      expect(Buffer.from(first, 'base64').subarray(0, 12)).not.toEqual(
        Buffer.from(second, 'base64').subarray(0, 12),
      );
      for (const encrypted of [first, second]) {
        expect(
          crypto.decryptSecret(encrypted, 'storage/sample/secretKey'),
        ).toBe(plaintext);
        const payload = Buffer.from(encrypted, 'base64');
        expect(payload.toString('base64')).toBe(encrypted);
        expect(payload.length).toBe(28 + Buffer.byteLength(plaintext));
        const decipher = createDecipheriv(
          'aes-256-gcm',
          key,
          payload.subarray(0, 12),
          { authTagLength: 16 },
        );
        decipher.setAuthTag(payload.subarray(12, 28));
        expect(
          Buffer.concat([
            decipher.update(payload.subarray(28)),
            decipher.final(),
          ]).toString('utf8'),
        ).toBe(plaintext);
      }
    },
  );

  it('解密标准 Node 实现生成的记录，context 仅用于诊断', () => {
    const key = randomBytes(32);
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce, {
      authTagLength: 16,
    });
    const body = Buffer.concat([
      cipher.update('external secret', 'utf8'),
      cipher.final(),
    ]);
    const ciphertext = Buffer.concat([
      nonce,
      cipher.getAuthTag(),
      body,
    ]).toString('base64');
    const crypto = createSecretCrypto(key);
    for (const context of ['storage/sample/secretKey', 'smtp/password']) {
      expect(crypto.decryptSecret(ciphertext, context)).toBe('external secret');
    }
  });

  it('只使用独立部署加密密钥，改变认证密钥不影响解密', () => {
    const env = {
      ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    };
    const ciphertext = createSecretCrypto(
      parseRuntimeEnv(env).encryptionKey,
    ).encryptSecret('saved secret');
    env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
    expect(
      createSecretCrypto(parseRuntimeEnv(env).encryptionKey).decryptSecret(
        ciphertext,
        'oauth/clientSecret',
      ),
    ).toBe('saved secret');
  });

  it.each(['key', 'nonce', 'tag', 'body'] as const)(
    '拒绝错误密钥或被篡改的 %s，错误保留位置且不泄密',
    (part) => {
      const key = randomBytes(32);
      const plaintext = 'private secret with unicode 密码';
      const ciphertext = createSecretCrypto(key).encryptSecret(plaintext);
      const payload = Buffer.from(ciphertext, 'base64');
      const changedKey = part === 'key' ? randomBytes(32) : key;
      if (part !== 'key') payload[{ nonce: 0, tag: 12, body: 28 }[part]] ^= 1;
      const damaged = payload.toString('base64');
      let error: unknown;
      try {
        createSecretCrypto(changedKey).decryptSecret(
          damaged,
          'storage/sample/secretKey',
        );
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain('storage/sample/secretKey');
      expect(String(error)).toContain('密文认证失败');
      for (const secret of [
        plaintext,
        ciphertext,
        damaged,
        key.toString('hex'),
        changedKey.toString('hex'),
      ]) {
        expect(inspect(error)).not.toContain(secret);
        expect(JSON.stringify(error)).not.toContain(secret);
      }
    },
  );

  it.each(['', ' ', 'not-base64!', Buffer.alloc(27).toString('base64')])(
    '拒绝无效或缺少 nonce/tag 的文本 %j',
    (ciphertext) => {
      expect(() =>
        createSecretCrypto(randomBytes(32)).decryptSecret(
          ciphertext,
          'smtp/password',
        ),
      ).toThrow('smtp/password: 密文格式无效');
    },
  );

  it('拒绝 Node 解码会忽略的字符、空白和缺失填充', () => {
    const crypto = createSecretCrypto(randomBytes(32));
    const ciphertext = crypto.encryptSecret('abc');
    for (const invalid of [
      `!${ciphertext}`,
      `${ciphertext}\n`,
      ciphertext.replace(/=+$/, ''),
    ]) {
      expect(() => crypto.decryptSecret(invalid, 'smtp/password')).toThrow(
        'smtp/password: 密文格式无效',
      );
    }
  });
});
