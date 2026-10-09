import { describe, expect, it } from 'vitest';
import { runBusinessBrowserStage } from '../../../scripts/browser-business.mjs';
import { runBrowserStage } from '../../../scripts/browser-stages.mjs';

const config = {
  dataDirectory: '/test/upload',
  credentials: { email: 'owner' },
};
type Stage = { status: string; blockedBy?: string[]; error?: string };

function fixture({
  restartError = false,
  codes = [] as string[],
  uploadError = false,
  ownerReady = true,
} = {}) {
  const stages: Record<string, Stage> = {
    owner: { status: ownerReady ? 'passed' : 'failed' },
  };
  const calls: {
    script?: string;
    input?: unknown;
    log?: string;
    restart?: string;
  }[] = [];
  const check = (
    name: string,
    operation: () => Promise<void>,
    dependencies: string[] = [],
  ) => runBrowserStage(stages, name, operation, async () => {}, dependencies);
  const restart = async (dataDirectory: string) => {
    calls.push({ restart: dataDirectory });
    if (restartError) throw new Error('restart failed');
    return codes;
  };
  const runBrowser = async (script: string, input: unknown, log: string) => {
    calls.push({ script, input, log });
    if (uploadError && script.endsWith('/upload.mjs'))
      throw new Error('upload failed');
  };
  return {
    stages,
    calls,
    check,
    restart,
    runBrowser,
    run: (script: string, name = script) =>
      runBusinessBrowserStage({
        check,
        restart,
        runBrowser,
        config,
        script,
        name,
        dependencies: ['owner'],
      }),
  };
}

async function assertRestartFailureBlocked(
  f: ReturnType<typeof fixture>,
  script = 'upload',
) {
  expect(await f.run(script)).toBe(false);
  expect(f.stages[`${script}-runtime`].status).toBe('failed');
  expect(f.stages[script]).toEqual({
    status: 'blocked',
    blockedBy: [`${script}-runtime`],
  });
  expect(f.calls).toEqual([{ restart: config.dataDirectory }]);
}

describe('upload browser runtime isolation', () => {
  it('restarts the same DATA_DIR independently before each scene and preserves its exact config', async () => {
    const f = fixture();
    expect(await f.run('upload')).toBe(true);
    expect(await f.run('upload-polling')).toBe(true);
    expect(f.calls).toEqual([
      { restart: config.dataDirectory },
      { script: '../e2e/upload.mjs', input: config, log: 'upload.log' },
      { restart: config.dataDirectory },
      {
        script: '../e2e/upload-polling.mjs',
        input: config,
        log: 'upload-polling.log',
      },
    ]);
    expect(f.calls[1].input).toBe(config);
    expect(f.calls[3].input).toBe(config);
    expect(Object.keys(f.stages)).toEqual([
      'owner',
      'upload-runtime',
      'upload',
      'upload-polling-runtime',
      'upload-polling',
    ]);
  });

  it.each(['upload', 'upload-polling'])(
    'blocks %s when its own restart fails',
    async (script) => {
      await assertRestartFailureBlocked(
        fixture({ restartError: true }),
        script,
      );
    },
  );

  it.each(['upload', 'upload-polling'])(
    'blocks %s if the initialized restart issues a setup code',
    async (script) => {
      const f = fixture({ codes: ['unexpected-setup-code'] });
      await assertRestartFailureBlocked(f, script);
      expect(f.stages[`${script}-runtime`].error).toContain(
        'unexpected-setup-code',
      );
    },
  );

  it('does not block independent polling after upload assertions fail', async () => {
    const f = fixture({ uploadError: true });
    expect(await f.run('upload')).toBe(false);
    expect(await f.run('upload-polling')).toBe(true);
    expect(f.stages.upload.status).toBe('failed');
    expect(f.stages['upload-polling-runtime'].status).toBe('passed');
    expect(f.stages['upload-polling'].status).toBe('passed');
    expect(f.calls.filter((call) => call.restart)).toHaveLength(2);
  });

  it('does not restart or run a browser scene without its initialized owner', async () => {
    const f = fixture({ ownerReady: false });
    expect(await f.run('upload')).toBe(false);
    expect(f.calls).toEqual([]);
    expect(f.stages['upload-runtime']).toEqual({
      status: 'blocked',
      blockedBy: ['owner'],
    });
    expect(f.stages.upload).toEqual({
      status: 'blocked',
      blockedBy: ['owner', 'upload-runtime'],
    });
  });

  it.each(['upload-settings', 'upload-input', 'site-general'])(
    'runs ordinary scene %s without a restart',
    async (script) => {
      const f = fixture();
      expect(await f.run(script, `named-${script}`)).toBe(true);
      expect(f.calls).toEqual([
        {
          script: `../e2e/${script}.mjs`,
          input: config,
          log: `named-${script}.log`,
        },
      ]);
      expect(f.stages[`named-${script}`]).toEqual({ status: 'passed' });
    },
  );

  it('preserves the owner dependency for ordinary scenes', async () => {
    const f = fixture({ ownerReady: false });
    expect(await f.run('site-general')).toBe(false);
    expect(f.calls).toEqual([]);
    expect(f.stages['site-general']).toEqual({
      status: 'blocked',
      blockedBy: ['owner'],
    });
  });
});
