import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runLocalExperiment } from '../../experiments/storage-local/suite.ts';

it('真实文件流验证路径、发布、取消、权限和清理；缺失环境不能填通过', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ariso-storage-test-'));
  try {
    const report = await runLocalExperiment({
      sourceRoot: root,
      storageRoot: root,
    });
    expect(report.checks.map((check) => check.name)).toEqual([
      'paths',
      'same-device',
      'permission',
    ]);
    expect(report.incomplete).toEqual(['cross-device', 'low-space']);
    expect(report.checks.every((check) => check.passed)).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
