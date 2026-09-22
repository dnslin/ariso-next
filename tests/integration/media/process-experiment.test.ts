import { expect, it } from 'vitest';
import { verifyProcessLifecycle } from '../../experiments/media-basic/process.mjs';

it('真实子进程取消、强杀和超时均回收进程；Linux 挂起验证缺失不能填通过', async () => {
  const report = await verifyProcessLifecycle();
  expect(report.checks.map((check) => check.name)).toEqual([
    'sigterm',
    'ignore-sigterm',
    'timeout',
    ...(process.platform === 'linux' ? ['stopped-linux'] : []),
  ]);
  expect(report.incomplete).toEqual(
    process.platform === 'linux'
      ? []
      : ['stopped-linux: requires Linux /proc stopped-state evidence'],
  );
  for (const check of report.checks) {
    expect(check.passed).toBe(true);
    expect(check.evidence.processAbsentAfterReap).toBe(true);
    expect(check.evidence.elapsedAfterReadyOrCancelMs).toBeLessThan(5_000);
  }
  expect(report.checks[0].evidence.signal).toBe('SIGTERM');
  expect(report.checks[1].evidence.signal).toBe('SIGKILL');
  expect(report.checks[2].evidence.timedOut).toBe(true);
}, 20_000);
