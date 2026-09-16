import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  assertPortClosed,
  containerEnvironment,
  parseRecords,
} from '../../../scripts/verify-container.mjs';

describe('container verification assertions', () => {
  const record = {
    time: '2026-09-16T12:00:00Z',
    level: 'info',
    module: 'runtime.prestart',
    msg: 'prestart completed',
    phase: 'prestart',
  };
  it('接受逐行 JSON 并保留可诊断字段', () => {
    expect(parseRecords(`${JSON.stringify(record)}\n`)).toEqual([record]);
  });
  it.each([
    '',
    'Next.js started',
    JSON.stringify({ ...record, time: 'today' }),
    JSON.stringify({ ...record, msg: undefined }),
    JSON.stringify({ ...record, level: 'unknown' }),
    JSON.stringify({ ...record, module: '' }),
  ])('拒绝空日志、普通文本或缺失必要字段: %s', (logs) => {
    expect(() => parseRecords(logs)).toThrow();
  });
  it('显式隔离父进程配置，保留Docker连接环境', () => {
    const parent = {
      PATH: '/bin',
      DOCKER_HOST: 'unix:///test.sock',
      BETTER_AUTH_SECRET: 'real',
      ARISO_ENCRYPTION_KEY: 'real',
      LOG_LEVEL: 'fatal',
    };
    expect(containerEnvironment(parent)).toEqual({
      PATH: '/bin',
      DOCKER_HOST: 'unix:///test.sock',
    });
    expect(parent.BETTER_AUTH_SECRET).toBe('real');
  });
  it('即使没有HTTP响应也拒绝已监听TCP端口，关闭后通过', async () => {
    const server = createServer((socket) => socket.on('error', () => {}));
    await new Promise<void>((accept) => server.listen(0, '127.0.0.1', accept));
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('TCP address missing');
    try {
      await expect(assertPortClosed(address.port)).rejects.toThrow(
        'TCP listener',
      );
    } finally {
      await new Promise<void>((accept, reject) =>
        server.close((error) => (error ? reject(error) : accept())),
      );
    }
    await expect(assertPortClosed(address.port)).resolves.toBeUndefined();
  });
});
