import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRuntimeEnv } from '../../../src/server/runtime/env';

const secrets = {
  BETTER_AUTH_SECRET: 'test-only-auth-secret-32-characters',
  ARISO_ENCRYPTION_KEY: 'aB09'.repeat(16),
};

afterEach(() => vi.unstubAllEnvs());

describe('parseRuntimeEnv', () => {
  it('应用默认值并解码独立密钥，忽略无关环境变量', () => {
    expect(parseRuntimeEnv({ ...secrets, HOSTNAME: 'container-id' })).toEqual({
      host: '0.0.0.0',
      port: 3000,
      dataDir: '/data',
      logLevel: 'info',
      betterAuthSecret: secrets.BETTER_AUTH_SECRET,
      encryptionKey: Buffer.from(secrets.ARISO_ENCRYPTION_KEY, 'hex'),
    });
    expect(parseRuntimeEnv(secrets).encryptionKey).toHaveLength(32);
  });

  it.each(['1', '65535', '03000'])('接受十进制端口 %s', (port) => {
    expect(parseRuntimeEnv({ ...secrets, PORT: port }).port).toBe(Number(port));
  });

  it.each(['127.0.0.1', '::', 'localhost'])('保留监听地址 %s', (host) => {
    expect(parseRuntimeEnv({ ...secrets, HOST: host }).host).toBe(host);
  });

  it.each(['/', '/tmp/ariso data', '/tmp/../data'])(
    '保留绝对路径 %s',
    (dataDir) => {
      expect(parseRuntimeEnv({ ...secrets, DATA_DIR: dataDir }).dataDir).toBe(
        dataDir,
      );
    },
  );

  it.each(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])(
    '接受日志级别 %s',
    (logLevel) => {
      expect(
        parseRuntimeEnv({ ...secrets, LOG_LEVEL: logLevel }).logLevel,
      ).toBe(logLevel);
    },
  );

  it.each([32, 33, 128])('保留 %i 字符的认证密钥', (length) => {
    const value = 's'.repeat(length);
    expect(
      parseRuntimeEnv({ ...secrets, BETTER_AUTH_SECRET: value })
        .betterAuthSecret,
    ).toBe(value);
  });

  it.each([
    ...[
      '',
      ' ',
      '0',
      '65536',
      '-1',
      '+1',
      '1.5',
      '1e3',
      '0x10',
      '3000x',
      ' 3000',
      '3000\n',
      '9'.repeat(400),
    ].map((value) => ['PORT', value]),
    ...['', ' \t'].map((value) => ['HOST', value]),
    ...['', ' ', 'data', './data', '~/data'].map((value) => [
      'DATA_DIR',
      value,
    ]),
    ...['', 'INFO', 'silent', 'verbose'].map((value) => ['LOG_LEVEL', value]),
    ...[undefined, '', 's'.repeat(31)].map((value) => [
      'BETTER_AUTH_SECRET',
      value,
    ]),
    ...[
      undefined,
      '',
      'a'.repeat(63),
      'a'.repeat(65),
      'g'.repeat(64),
      ` ${'a'.repeat(64)}`,
      `${'a'.repeat(64)}\n`,
    ].map((value) => ['ARISO_ENCRYPTION_KEY', value]),
  ])('拒绝非法 %s（%s）并指出变量名', (name, value) => {
    expect(() =>
      parseRuntimeEnv({ ...secrets, [name as string]: value }),
    ).toThrow(name);
  });

  it('一次报告全部错误，错误对象不包含秘密或原始输入', () => {
    const auth = 'private-auth';
    const key = 'private-encryption';
    let error: unknown;
    try {
      parseRuntimeEnv({
        BETTER_AUTH_SECRET: auth,
        ARISO_ENCRYPTION_KEY: key,
        PORT: '0',
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain('BETTER_AUTH_SECRET');
    expect(String(error)).toContain('ARISO_ENCRYPTION_KEY');
    expect(String(error)).toContain('PORT');
    expect(String(error)).not.toContain(auth);
    expect(String(error)).not.toContain(key);
    expect(JSON.stringify(error)).toBe('{}');
    expect(error).not.toHaveProperty('cause');
  });

  it('导入时不访问部署变量，调用时才读取当前环境且不生成替代密钥', async () => {
    vi.resetModules();
    const original = process.env;
    const reads: string[] = [];
    const names = [
      'HOST',
      'PORT',
      'DATA_DIR',
      'LOG_LEVEL',
      ...Object.keys(secrets),
    ];
    process.env = new Proxy(original, {
      get(target, property) {
        if (typeof property === 'string' && names.includes(property))
          reads.push(property);
        return Reflect.get(target, property);
      },
    });
    try {
      await import('../../../src/server/runtime/env');
      expect(reads).toEqual([]);
    } finally {
      process.env = original;
    }
    for (const name of names) vi.stubEnv(name, undefined);
    const { parseRuntimeEnv: parse } =
      await import('../../../src/server/runtime/env');
    expect(() => parse()).toThrow('BETTER_AUTH_SECRET');
    expect(process.env.BETTER_AUTH_SECRET).toBeUndefined();
    expect(process.env.ARISO_ENCRYPTION_KEY).toBeUndefined();
    for (const [name, value] of Object.entries(secrets))
      vi.stubEnv(name, value);
    vi.stubEnv('PORT', '4321');
    expect(parse().port).toBe(4321);
  });
});
