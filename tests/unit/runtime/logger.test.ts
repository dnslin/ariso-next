import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { createRuntimeLogger } from '../../../src/server/runtime/logger';

function capture(level: 'trace' | 'info' = 'trace') {
  const lines: string[] = [];
  const logger = createRuntimeLogger('runtime.test', level, {
    write(line) {
      lines.push(line);
    },
  });
  return {
    logger,
    lines,
    records: () => lines.map((line) => JSON.parse(line)),
  };
}

describe('runtime logger', () => {
  it('每次输出单行 JSON，包含时间、级别、模块与插值消息', () => {
    const { logger, lines, records } = capture();
    for (const level of [
      'trace',
      'debug',
      'info',
      'warn',
      'error',
      'fatal',
    ] as const) {
      logger[level](
        {
          phase: 'read',
          imageId: 'image-1',
          taskId: 'task-1',
          storageId: 'local',
          path: '/data/a',
        },
        'line\n%s',
        'two',
      );
    }
    expect(lines).toHaveLength(6);
    for (const [index, record] of records().entries()) {
      expect(lines[index].split('\n')).toHaveLength(2);
      expect(record).toMatchObject({
        module: 'runtime.test',
        msg: 'line\ntwo',
        path: '/data/a',
        phase: 'read',
        imageId: 'image-1',
        taskId: 'task-1',
        storageId: 'local',
      });
      expect(record.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    expect(records().map((record) => record.level)).toEqual([
      'trace',
      'debug',
      'info',
      'warn',
      'error',
      'fatal',
    ]);
  });
  it('无需部署密钥即可导入并向 stdout 输出真实 JSON', () => {
    const env = { ...process.env };
    delete env.BETTER_AUTH_SECRET;
    delete env.ARISO_ENCRYPTION_KEY;
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import { createRuntimeLogger } from './src/server/runtime/logger.ts';
      createRuntimeLogger('runtime.process', 'info').info('GET /reset?token=process-private&page=1');
    `,
      ],
      { cwd: process.cwd(), env, encoding: 'utf8' },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      module: 'runtime.process',
      level: 'info',
      msg: 'GET /reset?token=[Redacted]&page=1',
    });
  });

  it('遵守显式日志级别', () => {
    const { logger, records } = capture('info');
    logger.debug('hidden');
    logger.info('visible');
    expect(records()).toHaveLength(1);
  });
  it('隐藏指定结构化字段，保留上下文且不修改输入', () => {
    const { logger, lines, records } = capture();
    const fields = {
      apiKey: 'api-private',
      'x-api-key': 'api-header-private',
      accessKey: 'access-key-private',
      secretKey: 'secret-key-private',
      authorization: 'auth-private',
      cookie: 'cookie-private',
      uploadToken: 'upload-private',
      accessToken: 'access-private',
      refreshToken: 'refresh-private',
      resetToken: 'reset-private',
      accessKeyId: 'key-id-private',
      secretAccessKey: 's3-private',
      sessionToken: 'session-private',
      password: 'smtp-private',
      clientSecret: 'oauth-private',
      sharePassword: 'share-private',
      betterAuthSecret: 'auth-key-private',
      encryptionKey: Buffer.from('encryption-private'),
      BETTER_AUTH_SECRET: 'env-auth-private',
      ARISO_ENCRYPTION_KEY: 'env-encryption-private',
    };
    logger.info(
      {
        ...fields,
        config: fields,
        req: {
          headers: {
            Authorization: 'header-private',
            Cookie: 'header-cookie-private',
          },
        },
        path: '/data/db.sqlite',
        smtp: { host: 'mail.example', password: 'smtp-private' },
      },
      'saved',
    );
    for (const value of Object.values(fields))
      expect(lines.join('')).not.toContain(value.toString());
    expect(lines.join('')).not.toContain('header-private');
    expect(records()[0]).toMatchObject({
      encryptionKey: '[Redacted]',
      path: '/data/db.sqlite',
      smtp: { host: 'mail.example', password: '[Redacted]' },
      config: { encryptionKey: '[Redacted]' },
    });
    expect(fields.password).toBe('smtp-private');
    expect(fields.encryptionKey.toString()).toBe('encryption-private');
  });
  it('隐藏消息插值、嵌套字符串、错误堆栈与 cause 的 URL 凭据', () => {
    const { logger, lines, records } = capture();
    const cause = Object.assign(
      new Error('ENOENT /reset?token=cause-private&view=full'),
      { code: 'ENOENT', path: '/data/missing' },
    );
    const err = Object.assign(
      new Error('failed /callback?code=error-private&state=ok', { cause }),
      { phase: 'read' },
    );
    logger.error(
      {
        err,
        urls: ['/reset?token=array-private&lang=zh'],
        details: { url: '/s3?X-Amz-Signature=nested-private&partNumber=1' },
      },
      'GET /reset?%s=%s&view=full',
      'token',
      'message-private',
    );
    const output = lines.join('');
    for (const secret of [
      'cause-private',
      'error-private',
      'array-private',
      'nested-private',
      'message-private',
    ])
      expect(output).not.toContain(secret);
    expect(records()[0]).toMatchObject({
      err: {
        type: 'Error',
        phase: 'read',
        cause: { code: 'ENOENT', path: '/data/missing' },
      },
      msg: 'GET /reset?token=[Redacted]&view=full',
    });
    expect(records()[0].err.stack).toContain(
      '/callback?code=[Redacted]&state=ok',
    );
    expect(records()[0].err.cause.stack).toContain(
      'ENOENT /reset?token=[Redacted]&view=full',
    );
    expect(err.message).toContain('error-private');
  });
  it.each([123, null, { url: '/reset?token=object-private' }])(
    'Pino 对象消息 %j 不导致日志失败',
    (msg) => {
      const { logger, lines, records } = capture();
      expect(() => logger.info({ msg })).not.toThrow();
      expect(records()).toHaveLength(1);
      expect(lines.join('')).not.toContain('object-private');
      expect(records()[0].msg).toEqual(
        typeof msg === 'object' && msg !== null
          ? { url: '/reset?token=[Redacted]' }
          : msg,
      );
    },
  );

  it.each([
    'ENOENT /data/file?token=cause-private',
    { code: 'ENOENT', path: '/data/file', url: '/reset?token=cause-private' },
    null,
    42,
  ])('保留非 Error cause %j', (cause) => {
    const { logger, lines, records } = capture();
    logger.error(new Error('failed', { cause }));
    expect(records()[0].err.cause).toEqual(
      typeof cause === 'string'
        ? 'ENOENT /data/file?token=[Redacted]'
        : cause && typeof cause === 'object'
          ? { ...cause, url: '/reset?token=[Redacted]' }
          : cause,
    );
    expect(lines.join('')).not.toContain('cause-private');
  });

  it('子日志绑定使用同一规则；循环对象仍能输出', () => {
    const { logger, lines, records } = capture();
    const context: Record<string, unknown> = {
      url: '/reset?token=cycle-private',
    };
    context.self = context;
    logger
      .child({
        uploadToken: 'child-private',
        url: '/callback?code=child-url-private&state=ok',
      })
      .info({ context }, 'event');
    expect(lines.join('')).not.toContain('private');
    expect(records()[0].url).toBe('/callback?code=[Redacted]&state=ok');
    expect(records()[0].context.self.self).toBe('[Circular]');
  });
});
