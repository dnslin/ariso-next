import { expect, it } from 'vitest';
import { runIdentityManagement } from '../../../scripts/browser-identity-management.mjs';
import { runBrowserStage } from '../../../scripts/browser-stages.mjs';

const config = {
  width: 390,
  dataDirectory: '/test/identity',
  credentials: { email: 'owner' },
};

function fixture({
  restartFails = false,
  tokensFail = false,
  oauthFail = false,
  ownerReady = true,
} = {}) {
  const stages: Record<string, { status: string; blockedBy?: string[] }> = {
    owner: { status: ownerReady ? 'passed' : 'failed' },
  };
  const calls: unknown[] = [];
  const run = () =>
    runIdentityManagement({
      config,
      dependencies: ['owner'],
      check: (
        name: string,
        operation: () => Promise<void>,
        dependencies: string[],
      ) =>
        runBrowserStage(stages, name, operation, async () => {}, dependencies),
      runBrowser: async (script: string, input: unknown, log: string) => {
        calls.push({ script, input, log });
        if (script.endsWith('tokens.mjs') && tokensFail)
          throw new Error('tokens failed');
        if (script.endsWith('oauth.mjs') && oauthFail)
          throw new Error('OAuth failed');
      },
      restart: async (dataDirectory: string) => {
        calls.push({ restart: dataDirectory });
        if (restartFails) throw new Error('restart failed');
      },
    });
  return { run, calls, stages };
}

it('runs Token, OAuth persistence and Account in order with separate scene inputs and stages', async () => {
  const f = fixture();
  await expect(f.run()).resolves.toEqual({
    tokensPassed: true,
    oauthPassed: true,
    accountPassed: true,
  });
  expect(f.calls).toEqual([
    { script: '../e2e/tokens.mjs', input: config, log: 'tokens-390.log' },
    { restart: config.dataDirectory },
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
    { restart: config.dataDirectory },
    { script: '../e2e/account.mjs', input: config, log: 'account-390.log' },
  ]);
  expect(Object.keys(f.stages)).toEqual([
    'owner',
    'tokens-390',
    'oauth-runtime-390',
    'oauth-390-before',
    'oauth-390-restart',
    'oauth-390-after',
    'oauth-390-enable-restart',
    'oauth-390-enabled',
    'account-runtime-390',
    'account-390',
  ]);
});

it('blocks Account if restarting fails', async () => {
  const f = fixture({ restartFails: true });
  await expect(f.run()).resolves.toEqual({
    tokensPassed: true,
    oauthPassed: false,
    accountPassed: false,
  });
  expect(f.stages['account-390']).toMatchObject({
    status: 'blocked',
    blockedBy: ['account-runtime-390'],
  });
  expect(f.calls).toHaveLength(3);
});

it('preserves independent Account verification after a Token failure', async () => {
  const f = fixture({ tokensFail: true });
  await expect(f.run()).resolves.toEqual({
    tokensPassed: false,
    oauthPassed: true,
    accountPassed: true,
  });
  expect(f.calls).toHaveLength(9);
});

it('keeps Account independent from failed OAuth verification while retaining the failed stage', async () => {
  const f = fixture({ oauthFail: true });
  await expect(f.run()).resolves.toEqual({
    tokensPassed: true,
    oauthPassed: false,
    accountPassed: true,
  });
  expect(f.stages['oauth-390-before'].status).toBe('failed');
  expect(f.stages['account-390'].status).toBe('passed');
  expect(f.calls.at(-1)).toEqual({
    script: '../e2e/account.mjs',
    input: config,
    log: 'account-390.log',
  });
});

it('does not run the chain without an initialized owner', async () => {
  const f = fixture({ ownerReady: false });
  await expect(f.run()).resolves.toEqual({
    tokensPassed: false,
    oauthPassed: false,
    accountPassed: false,
  });
  expect(f.calls).toEqual([]);
  expect(f.stages['account-390']).toMatchObject({
    status: 'blocked',
    blockedBy: ['owner', 'account-runtime-390'],
  });
});
