import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupOwnerSettings,
  verifyOwnerShell,
} from '../../../e2e/owner-shell.mjs';
import { isBrowserControlStop } from '../../../e2e/browser-errors.mjs';
import {
  cleanupLibraryObserver,
  verifyLibrary,
  verifyLibraryHistory,
  verifyLibraryErrorRecovery,
} from '../../experiments/ui/library-browser.mjs';

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

describe.each([
  ['history', verifyLibraryHistory],
  ['pending-error', verifyLibraryErrorRecovery],
] as const)('library %s cleanup boundary', (boundary, verify) => {
  it.each(['user has taken control', 'ordinary browser failure'])(
    'retains the real responsibility boundary: %s',
    async (message) => {
      const error = new Error(message);
      const report: Record<string, unknown> = { status: 'failed' };
      const page = {
        evaluate: vi.fn(async () => {
          if (boundary === 'history' && page.evaluate.mock.calls.length === 1)
            throw error;
        }),
        fill: vi.fn(async () => {
          throw error;
        }),
      };
      await expect(verify(page, report)).rejects.toBe(error);
      expect(report.stoppedForUserControl).toBe(isBrowserControlStop(error));
      expect(page.evaluate).toHaveBeenCalledTimes(
        isBrowserControlStop(error) ? 1 : 2,
      );
    },
  );
});

describe.each(['remove-script', 'restore-fetch'] as const)(
  'library observer cleanup boundary: %s',
  (boundary) => {
    it.each(['user has taken control', 'ordinary browser failure'])(
      'cleanup failure makes the report failed: %s',
      async (message) => {
        const error = new Error(message);
        const report: Record<string, unknown> = { status: 'passed' };
        const page = {
          cdp: vi.fn(async () => {
            if (boundary === 'remove-script') throw error;
          }),
          evaluate: vi.fn(async () => {
            throw error;
          }),
        };
        await expect(
          cleanupLibraryObserver(page, report, { identifier: 'observer' }),
        ).rejects.toBe(error);
        expect(page.cdp).toHaveBeenCalledOnce();
        expect(page.evaluate).toHaveBeenCalledTimes(
          boundary === 'remove-script' ? 0 : 1,
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

describe('owner settings cleanup boundary', () => {
  it.each(['release-settings', 'remove-script'] as const)(
    'records the installed script when %s first loses control',
    async (boundary) => {
      const error = new Error('user has taken control');
      const report: Record<string, unknown> = {
        status: 'failed',
        error: 'original scene error',
      };
      const page = {
        evaluate: vi.fn(async () => {
          if (boundary === 'release-settings') throw error;
        }),
        cdp: vi.fn(async () => {
          throw error;
        }),
      };
      await expect(
        cleanupOwnerSettings(page, report, { identifier: 'settings' }),
      ).rejects.toBe(error);
      expect(page.evaluate).toHaveBeenCalledOnce();
      expect(page.cdp).toHaveBeenCalledTimes(
        boundary === 'remove-script' ? 1 : 0,
      );
      expect(report.error).toBe('original scene error');
      expect(report.cleanupError).toContain(error.message);
      expect(report.stoppedForUserControl).toBe(true);
      expect(report.pendingBrowserCleanup).toEqual({
        scriptIdentifier: 'settings',
        settingsReleased: boundary === 'remove-script',
      });
    },
  );

  it('only records pending cleanup if control was already lost', async () => {
    const report: Record<string, unknown> = { stoppedForUserControl: true };
    const page = { evaluate: vi.fn(), cdp: vi.fn() };
    await cleanupOwnerSettings(page, report, { identifier: 'settings' });
    expect(page.evaluate).not.toHaveBeenCalled();
    expect(page.cdp).not.toHaveBeenCalled();
    expect(report.pendingBrowserCleanup).toEqual({
      scriptIdentifier: 'settings',
      settingsReleased: false,
    });
  });

  it('clears pending state after successful release and script removal', async () => {
    const report: Record<string, unknown> = {};
    const page = {
      evaluate: vi.fn(async () => {}),
      cdp: vi.fn(async () => {}),
    };
    await cleanupOwnerSettings(page, report, { identifier: 'settings' });
    expect(page.evaluate).toHaveBeenCalledOnce();
    expect(page.cdp).toHaveBeenCalledWith(
      'Page.removeScriptToEvaluateOnNewDocument',
      { identifier: 'settings' },
    );
    expect(report).not.toHaveProperty('pendingBrowserCleanup');
  });
});
