import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function run(script: string, level?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, LOG_LEVEL: level };
  delete env.BETTER_AUTH_SECRET;
  delete env.ARISO_ENCRYPTION_KEY;
  return spawnSync(
    process.execPath,
    ['--import', './src/cli/logging.ts', '--input-type=module', '-e', script],
    { env, encoding: 'utf8', timeout: 10000 },
  );
}

describe('console preload bridge', () => {
  it('在主入口之前接管级别、插值与多行消息，Pino 直接输出无递归', () => {
    const result = run(
      `
      import { createRuntimeLogger } from './src/server/runtime/logger.ts';
      console.log('hello %s %d', 'world', 16);
      console.info('line\\ntwo');
      console.warn('warning');
      console.error('error');
      console.debug('debug');
      console.trace('trace');
      console.log();
      createRuntimeLogger('direct', 'info').info('direct output');
    `,
      'trace',
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    const allRecords = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const records = allRecords.filter(
      (record) => record.module === 'runtime.console',
    );
    expect(records.map((record) => record.level)).toEqual([
      'info',
      'info',
      'warn',
      'error',
      'debug',
      'trace',
      'info',
    ]);
    expect(records[0].msg).toBe('hello world 16');
    expect(records[1].msg).toBe('line\ntwo');
    expect(records[6].msg).toBe('');
    expect(
      allRecords.find((record) => record.module === 'direct'),
    ).toMatchObject({
      module: 'direct',
      msg: 'direct output',
    });
    for (const record of records.slice(0, 7)) {
      expect(record.module).toBe('runtime.console');
      expect(record.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('保留前缀后的 Error、cause、路径和错误码，并复用 URL 脱敏', () => {
    const result = run(
      `
      const cause = Object.assign(new Error('GET /reset?token=cause-private&page=1'), {code:'ENOENT', path:'/data/missing'});
      const err = new Error('GET /callback?code=error-private&state=ok', {cause});
      console.error('request failed', err);
      console.warn('GET /reset?%s=%s&view=full', 'token', 'message-private');
    `,
      'trace',
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain('private');
    const [record, warning] = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(record).toMatchObject({
      level: 'error',
      err: { type: 'Error', cause: { code: 'ENOENT', path: '/data/missing' } },
    });
    expect(record.err.stack).toContain('/callback?code=[Redacted]&state=ok');
    expect(record.msg).toContain('request failed');
    expect(warning.msg).toBe('GET /reset?token=[Redacted]&view=full');
  });

  it.each([undefined, 'warn', 'fatal'])('遵守日志级别 %s', (level) => {
    const result = run(
      "console.debug('debug'); console.info('info'); console.warn('warn'); console.error('error');",
      level,
    );
    expect(result.status, result.stderr).toBe(0);
    const records = result.stdout.trim()
      ? result.stdout
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : [];
    expect(records.map((record) => record.level)).toEqual(
      level === 'fatal'
        ? []
        : level === 'warn'
          ? ['warn', 'error']
          : ['info', 'warn', 'error'],
    );
  });

  it('无效日志配置输出 JSON 错误且不执行主入口、不回显原值', () => {
    const result = run("console.log('MAIN_EXECUTED')", 'secret-invalid-value');
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toContain('secret-invalid-value');
    expect(result.stdout).not.toContain('MAIN_EXECUTED');
    expect(JSON.parse(result.stdout)).toMatchObject({
      module: 'runtime.console',
      level: 'fatal',
      phase: 'logging',
      err: {
        message: 'LOG_LEVEL: 必须是 trace/debug/info/warn/error/fatal 之一',
      },
    });
  });
});
