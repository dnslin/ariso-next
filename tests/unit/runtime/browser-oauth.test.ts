import { expect, it } from 'vitest';
import { runOAuthManagement } from '../../../scripts/browser-oauth.mjs';
import { runBrowserStage } from '../../../scripts/browser-stages.mjs';

const config = { width: 390, dataDirectory: '/test/oauth', phase: 'unrelated' };

function fixture({
  failedPhase,
  restartFails = false,
}: { failedPhase?: string; restartFails?: boolean } = {}) {
  const stages: Record<string, { status: string; blockedBy?: string[] }> = {
    owner: { status: 'passed' },
  };
  const calls: unknown[] = [];
  const run = () =>
    runOAuthManagement({
      config,
      dependencies: ['owner'],
      check: (
        name: string,
        operation: () => Promise<void>,
        dependencies: string[],
      ) =>
        runBrowserStage(stages, name, operation, async () => {}, dependencies),
      runBrowser: async (
        script: string,
        input: { oauthPhase: string },
        log: string,
      ) => {
        calls.push({ script, input, log });
        if (input.oauthPhase === failedPhase)
          throw new Error('OAuth scene failed');
      },
      restart: async (directory: string) => {
        calls.push({ restart: directory });
        if (restartFails) throw new Error('restart failed');
      },
    });
  return { run, calls, stages };
}

it('verifies disabled persistence, then explicit enablement through two real same-data restarts', async () => {
  const f = fixture();
  await expect(f.run()).resolves.toBe(true);
  expect(f.calls).toEqual([
    {
      script: '../e2e/oauth.mjs',
      input: { ...config, oauthPhase: 'before' },
      log: 'oauth-390-before.log',
    },
    { restart: config.dataDirectory },
    {
      script: '../e2e/oauth.mjs',
      input: { ...config, oauthPhase: 'after' },
      log: 'oauth-390-after.log',
    },
    { restart: config.dataDirectory },
    {
      script: '../e2e/oauth.mjs',
      input: { ...config, oauthPhase: 'enabled' },
      log: 'oauth-390-enabled.log',
    },
  ]);
  expect(Object.keys(f.stages)).toEqual([
    'owner',
    'oauth-390-before',
    'oauth-390-restart',
    'oauth-390-after',
    'oauth-390-enable-restart',
    'oauth-390-enabled',
  ]);
});

it('preserves a failed OAuth scene and blocks only its dependent evidence', async () => {
  const f = fixture({ failedPhase: 'before' });
  await expect(f.run()).resolves.toBe(false);
  expect(f.stages['oauth-390-before'].status).toBe('failed');
  expect(f.stages['oauth-390-after']).toMatchObject({
    status: 'blocked',
    blockedBy: ['oauth-390-before'],
  });
  expect(f.calls).toHaveLength(2);
});

it('does not present configuration as effective when its restart fails', async () => {
  const f = fixture({ restartFails: true });
  await expect(f.run()).resolves.toBe(false);
  expect(f.stages['oauth-390-after']).toMatchObject({
    status: 'blocked',
    blockedBy: ['oauth-390-restart'],
  });
  expect(f.calls).toHaveLength(2);
});
