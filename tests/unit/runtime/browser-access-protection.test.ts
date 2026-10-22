import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runBusinessBrowserStage } from '../../../scripts/browser-business.mjs';
import { runAccessProtectionBrowser } from '../../../scripts/browser-access-protection.mjs';
import { runBrowserStage } from '../../../scripts/browser-stages.mjs';

const fixture = vi.hoisted(() => ({ launch: vi.fn(), close: vi.fn() }));
vi.mock('../../../e2e/access-protection-fixture.ts', () => ({
  launchAccessProtectionBrowserFixture: fixture.launch,
}));
vi.mock('node:child_process', () => ({
  spawn: () => {
    throw new Error('Access protection must use the shared browser executor');
  },
}));

const browserInput = {
  origin: 'http://access-fixture.test',
  credentials: { password: 'fixture-password' },
  ownerCookie: 'fixture-owner-cookie',
  shareToken: 'fixture-share-token',
  imageShareToken: 'image-share-secret',
};
let output: string;
beforeEach(async () => {
  output = await mkdtemp(join(tmpdir(), 'browser-access-protection-'));
  fixture.close.mockReset().mockResolvedValue(undefined);
  fixture.launch.mockReset().mockResolvedValue({
    browserInput,
    close: fixture.close,
  });
});
afterEach(async () => {
  await rm(output, { recursive: true, force: true });
});

it.each([false, true])(
  'uses the shared executor and closes its fixture when that executor fails=%s',
  async (fails) => {
    const secrets: string[] = [];
    const stages: Record<string, { status: string; error?: string }> = {
      owner: { status: 'passed' },
    };
    const runBrowser = vi.fn(async () => {
      expect(secrets).toEqual([
        browserInput.credentials.password,
        browserInput.ownerCookie,
        browserInput.shareToken,
        browserInput.imageShareToken,
      ]);
      if (fails) throw new Error('shared browser timeout');
    });
    const passed = await runBusinessBrowserStage({
      check: (name: string, run: () => Promise<void>, dependencies: string[]) =>
        runBrowserStage(stages, name, run, async () => {}, dependencies),
      runBrowser,
      restart: vi.fn(),
      signal: new AbortController().signal,
      secrets,
      config: { spaceId: 8, pageLabel: 'p2', output },
      script: 'access-protection',
      dependencies: ['owner'],
    });
    expect(runBrowser).toHaveBeenCalledWith(
      '../e2e/access-protection.mjs',
      expect.objectContaining({ ...browserInput, spaceId: 8, pageLabel: 'p2' }),
      'access-protection.log',
    );
    expect(passed).toBe(!fails);
    expect(stages['access-protection'].status).toBe(
      fails ? 'failed' : 'passed',
    );
    if (fails)
      expect(stages['access-protection'].error).toContain(
        'shared browser timeout',
      );
    expect(fixture.close).toHaveBeenCalledOnce();
  },
);

it.each(['before', 'during'])(
  'honors cancellation %s fixture startup without running a browser',
  async (when) => {
    const controller = new AbortController();
    const reason = new Error('shared runner interrupted');
    const runBrowser = vi.fn();
    if (when === 'before') controller.abort(reason);
    else
      fixture.launch.mockImplementation(async () => {
        controller.abort(reason);
        return { browserInput, close: fixture.close };
      });
    await expect(
      runAccessProtectionBrowser({
        runBrowser,
        signal: controller.signal,
        secrets: [],
        spaceId: 8,
        pageLabel: 'p1',
        output,
      }),
    ).rejects.toBe(reason);
    expect(runBrowser).not.toHaveBeenCalled();
    expect(fixture.launch).toHaveBeenCalledTimes(when === 'before' ? 0 : 1);
    expect(fixture.close).toHaveBeenCalledTimes(when === 'before' ? 0 : 1);
  },
);
