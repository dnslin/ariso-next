import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyOwnerShell } from '../../../e2e/owner-shell.mjs';
import { isBrowserControlStop } from '../../../e2e/browser-errors.mjs';
import { verifyLibrary } from '../../experiments/ui/library-browser.mjs';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

async function failAtBrowserBoundary(
  scenario: 'library' | 'owner',
  error: Error,
) {
  const output = await mkdtemp(join(tmpdir(), 'ariso-browser-control-'));
  directories.push(output);
  const page = {
    cdp: vi.fn(async (method: string) => {
      if (method === 'Page.addScriptToEvaluateOnNewDocument')
        return { identifier: 'observer' };
      if (method === 'Emulation.setDeviceMetricsOverride') throw error;
    }),
    evaluate: vi.fn(async () => []),
    snapshot: vi.fn(async () => 'offline transport snapshot'),
    screenshot: vi.fn(async () => {}),
  };
  const config = { output, origin: 'http://fixture.localhost' };
  const result =
    scenario === 'library'
      ? verifyLibrary(page, config)
      : verifyOwnerShell(page, config, 'owner');
  await expect(result).rejects.toBe(error);
  const reportPath =
    scenario === 'library'
      ? join(output, 'library.json')
      : join(output, 'owner', 'owner-shell.json');
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  expect(report.status).toBe('failed');
  expect(report.error).toContain(error.message);
  return { page, report };
}

describe.each(['library', 'owner'] as const)(
  '%s browser control boundary',
  (scenario) => {
    it.each([
      'user has taken control',
      'space 8 is inactive',
      'space 8 is unassigned',
      'Browser control unavailable',
    ])('停止后只写离线报告并传播原错误：%s', async (message) => {
      const { page, report } = await failAtBrowserBoundary(
        scenario,
        new Error(message),
      );
      expect(report.stoppedForUserControl).toBe(true);
      expect(page.evaluate).not.toHaveBeenCalled();
      expect(page.snapshot).not.toHaveBeenCalled();
      expect(page.screenshot).not.toHaveBeenCalled();
      expect(page.cdp.mock.calls.map(([method]) => method)).toEqual(
        scenario === 'library'
          ? [
              'Page.addScriptToEvaluateOnNewDocument',
              'Emulation.setDeviceMetricsOverride',
            ]
          : ['Emulation.setDeviceMetricsOverride'],
      );
    });

    it('普通失败仍诊断或还原钩子，并传播原错误', async () => {
      const { page, report } = await failAtBrowserBoundary(
        scenario,
        new Error('ordinary browser failure'),
      );
      expect(report.stoppedForUserControl).not.toBe(true);
      if (scenario === 'library') {
        expect(page.cdp.mock.calls.map(([method]) => method)).toEqual([
          'Page.addScriptToEvaluateOnNewDocument',
          'Emulation.setDeviceMetricsOverride',
          'Page.removeScriptToEvaluateOnNewDocument',
        ]);
        expect(page.evaluate).toHaveBeenCalledOnce();
        expect(page.snapshot).not.toHaveBeenCalled();
      } else {
        expect(page.evaluate).toHaveBeenCalledOnce();
        expect(page.snapshot).toHaveBeenCalledOnce();
        expect(page.screenshot).toHaveBeenCalledOnce();
      }
    });
  },
);

describe.each(['history', 'pending-error'] as const)(
  'library %s cleanup boundary',
  (boundary) => {
    it.each([
      ['user has taken control', false],
      ['ordinary browser failure', true],
    ] as const)(
      '真实内部 try/finally 保留停止边界：%s',
      async (message, cleanup) => {
        const source = await readFile(
          new URL('../../experiments/ui/library-browser.mjs', import.meta.url),
          'utf8',
        );
        const anchor =
          boundary === 'history'
            ? '    try {\n      const initial = await state();'
            : "    try {\n      await page.fill('#library-search', 'error');";
        const start = source.indexOf(anchor);
        const end = source.indexOf(
          boundary === 'history'
            ? '\n    report.checks.push('
            : '\n    await page.waitForFunction(',
          boundary === 'history'
            ? start
            : source.indexOf('    } finally {', start),
        );
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);
        const error = new Error(message);
        const evaluate = vi.fn(async () => {});
        const result = runInNewContext(
          `(async () => { ${source.slice(start, end)} })()`,
          {
            state: async () => {
              throw error;
            },
            page: {
              fill: async () => {
                throw error;
              },
              evaluate,
            },
            report: { status: 'failed' },
            isBrowserControlStop,
          },
        );
        await expect(result).rejects.toBe(error);
        expect(evaluate).toHaveBeenCalledTimes(cleanup ? 1 : 0);
      },
    );
  },
);

describe.each(['remove-script', 'restore-fetch'] as const)(
  'library outer cleanup boundary: %s',
  (boundary) => {
    it.each(['user has taken control', 'ordinary browser failure'])(
      '清理失败必须更新原 passed 报告并传播原错误：%s',
      async (message) => {
        const source = await readFile(
          new URL('../../experiments/ui/library-browser.mjs', import.meta.url),
          'utf8',
        );
        const start = source.lastIndexOf('\n  } finally {');
        const end = source.lastIndexOf('\n}');
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);
        const output = await mkdtemp(join(tmpdir(), 'ariso-browser-cleanup-'));
        directories.push(output);
        const error = new Error(message);
        const page = {
          cdp: vi.fn(async () => {
            if (boundary === 'remove-script') throw error;
          }),
          evaluate: vi.fn(async () => {
            throw error;
          }),
        };
        const result = runInNewContext(
          `(async () => { try {} ${source.slice(start + 5, end)} })()`,
          {
            page,
            config: { output },
            report: { status: 'passed' },
            observer: { identifier: 'observer' },
            scriptRemoved: false,
            isBrowserControlStop,
            writeFile,
          },
        );
        await expect(result).rejects.toBe(error);
        expect(page.cdp).toHaveBeenCalledOnce();
        expect(page.evaluate).toHaveBeenCalledTimes(
          boundary === 'remove-script' ? 0 : 1,
        );
        const report = JSON.parse(
          await readFile(join(output, 'library.json'), 'utf8'),
        );
        expect(report.status).toBe('failed');
        expect(report.error).toContain(message);
        expect(report.cleanupError).toContain(message);
        expect(report.stoppedForUserControl).toBe(isBrowserControlStop(error));
        expect(report.pendingBrowserCleanup).toEqual({
          scriptIdentifier: 'observer',
          scriptRemoved: boundary === 'restore-fetch',
          restoreFetch: true,
        });
      },
    );
  },
);
