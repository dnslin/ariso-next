import { describe, expect, it, vi } from 'vitest';
import {
  beginBackup,
  configureRestoreRemoteTarget,
  configureRestoreTargets,
  repairRestoreRemoteCredentials,
  importBackupThroughPage,
  prepareRestoreThroughPage,
  waitForRemoteRestoreReady,
  verifyRestoreReauthorization,
} from '../../../e2e/backup.mjs';

function page() {
  return {
    goto: vi.fn(),
    reload: vi.fn(),
    waitForSelector: vi.fn(),
    waitForFunction: vi.fn(),
    fill: vi.fn(),
    click: vi.fn(),
    focus: vi.fn(),
    keyboard: { press: vi.fn() },
    setInputFiles: vi.fn(),
    evaluate: vi.fn(),
  };
}
describe('approved restore browser flow', () => {
  it('exercises failed S3 credentials, correction, and unsaved location changes using the existing target flow', async () => {
    const browser = page();
    browser.evaluate
      .mockResolvedValueOnce('old-0')
      .mockResolvedValueOnce('true')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce('old-1')
      .mockResolvedValueOnce('true')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce('old-2')
      .mockResolvedValueOnce('true')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce('old-3')
      .mockResolvedValueOnce('true');
    const targets = ['one', 'two'].map((storageId) => ({
      storageId,
      confirmR2: true,
      value: {
        endpoint: 'https://r2.example.test',
        region: 'auto',
        bucket: 'image',
        pathPrefix: `owned/${storageId}`,
        forcePathStyle: false,
        accessKey: 'fixture-key',
        secretKey: 'fixture-real-secret',
      },
    }));
    const onStep = vi.fn();
    expect(await configureRestoreTargets(browser, targets, onStep)).toEqual({
      failedTestBlockedContinuation: true,
      correctedTestPassed: true,
      unsavedChangeBlockedContinuation: true,
    });
    expect(
      browser.fill.mock.calls
        .filter(([selector]) => selector === '#restore-one-secretKey')
        .map(([, value]) => value),
    ).toEqual(['invalid-backup-browser-secret', 'fixture-real-secret']);
    expect(browser.fill).toHaveBeenCalledWith(
      '#restore-one-pathPrefix',
      'owned/one-unsaved-change',
    );
    expect(browser.fill).toHaveBeenLastCalledWith(
      '#restore-one-pathPrefix',
      'owned/one',
    );
    expect(browser.waitForFunction.mock.calls[0][1]).toMatchObject({
      expectedState: 'failed',
    });
    expect(onStep).toHaveBeenCalledExactlyOnceWith('target-error');
    expect(targets[0].value.secretKey).toBe('fixture-real-secret');
  });
  it('waits for S3 readiness using the network-stage budget and records only elapsed time', async () => {
    const browser = page();
    browser.evaluate.mockResolvedValueOnce('ready');
    const result = await waitForRemoteRestoreReady(browser);
    expect(browser.waitForFunction.mock.calls[0][2]).toEqual({
      timeout: 90000,
    });
    expect(result).toEqual({ readyWaitMs: expect.any(Number) });
    expect(result.readyWaitMs).toBeGreaterThanOrEqual(0);
  });
  it.each(['failed', 'interrupted', 'cleanup-pending'])(
    'reports terminal S3 restore state %s without waiting for ready',
    async (state) => {
      const browser = page();
      browser.evaluate.mockResolvedValueOnce(state);
      await expect(waitForRemoteRestoreReady(browser)).rejects.toThrow(state);
      expect(browser.waitForSelector).not.toHaveBeenCalled();
    },
  );
  it('configures the selected S3 target and explicitly confirms R2 before waiting for a new test result', async () => {
    const browser = page();
    browser.evaluate
      .mockResolvedValueOnce('old-test')
      .mockResolvedValueOnce('true')
      .mockResolvedValueOnce(false);
    await configureRestoreRemoteTarget(browser, {
      storageId: 'remote',
      value: {
        endpoint: 'https://r2.example.test',
        accessKey: ' key ',
        forcePathStyle: true,
      },
      confirmR2: true,
    });
    expect(browser.fill.mock.calls).toEqual([
      ['#restore-remote-endpoint', 'https://r2.example.test'],
      ['#restore-remote-accessKey', ' key '],
    ]);
    expect(browser.keyboard.press).toHaveBeenCalledWith('Space');
    expect(browser.click).toHaveBeenLastCalledWith(
      '[data-testid="restore-r2-confirm"]',
    );
    expect(browser.waitForFunction.mock.calls.at(-1)?.[1]).toMatchObject({
      previousTest: 'old-test',
      expectedState: 'passed',
    });
  });
  it('repairs credentials without filling a destination field', async () => {
    const browser = page();
    browser.evaluate.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await repairRestoreRemoteCredentials(browser, {
      storageId: 'remote',
      secretKey: ' replacement ',
    });
    expect(browser.fill.mock.calls).toEqual([
      ['#restore-remote-secretKey', ' replacement '],
    ]);
    expect(browser.click).toHaveBeenLastCalledWith(
      '[data-testid="restore-target"][data-storage-id="remote"] [data-testid="restore-repair-target"]',
    );
  });
  it('captures backup password and confirmation before creation, then waits for the modal to leave', async () => {
    const browser = page();
    const steps: string[] = [];
    browser.evaluate.mockResolvedValueOnce({
      id: 'backup-id',
      status: 'preparing',
    });
    const onStep = vi.fn(async (step: string) => {
      steps.push(step);
    });
    expect(
      await beginBackup(browser, {
        origin: 'http://localhost',
        password: 'password',
        onStep,
      }),
    ).toBe('backup-id');
    expect(steps).toEqual(['password', 'confirm-backup', 'creating']);
    const afterClose = browser.waitForFunction.mock.invocationCallOrder.at(-1)!;
    expect(afterClose).toBeLessThan(onStep.mock.invocationCallOrder.at(-1)!);
  });
  it('captures configured destination and final confirmation before execution', async () => {
    const browser = page();
    const onStep = vi.fn();
    browser.evaluate.mockResolvedValueOnce(
      '数据已恢复，等待重启。新站点尚未启用',
    );
    await prepareRestoreThroughPage(browser, {
      publicUrl: 'http://localhost',
      onStep,
    });
    expect(onStep.mock.calls).toEqual([['targets'], ['confirm-restore']]);
    expect(onStep.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      browser.click.mock.invocationCallOrder.at(-1)!,
    );
  });
  it('submits code, file and unmodified password together', async () => {
    const browser = page();
    browser.evaluate
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce('备份已解密，应用版本匹配');
    await importBackupThroughPage(browser, {
      origin: 'http://localhost:41001',
      setupCode: 'code',
      password: ' 密码 ',
      file: '/backup.age',
    });
    expect(browser.fill.mock.calls).toEqual([
      ['#restore-code', 'code'],
      ['#restore-password', ' 密码 '],
    ]);
    expect(browser.setInputFiles).toHaveBeenCalledWith('#restore-file', [
      '/backup.age',
    ]);
    expect(browser.click).toHaveBeenCalledExactlyOnceWith(
      '[data-testid="restore-next"]',
    );
  });
  it('resumes ready after refresh using only the current setup code', async () => {
    const browser = page();
    browser.evaluate.mockResolvedValueOnce('');
    await verifyRestoreReauthorization(browser, { setupCode: 'current-code' });
    expect(browser.fill.mock.calls).toEqual([
      ['#restore-code', 'current-code'],
    ]);
    expect(browser.setInputFiles).not.toHaveBeenCalled();
    expect(browser.waitForSelector).toHaveBeenLastCalledWith(
      '[data-testid="restore-ready"]',
    );
  });
});
