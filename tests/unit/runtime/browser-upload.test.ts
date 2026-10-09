import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { runUploadBrowserStage } from '../../../scripts/browser-upload.mjs';
import { runBrowserStage } from '../../../scripts/browser-stages.mjs';
import { selectBrowserPlan } from '../../../scripts/browser-plan.mjs';

const config = {
  dataDirectory: '/test/upload',
  credentials: { email: 'owner' },
};
type Stage = { status: string; blockedBy?: string[]; error?: string };

function fixture(
  {
    restartError = false,
    codes = [] as string[],
    uploadError = false,
    ownerReady = true,
  } = {},
  run = runUploadBrowserStage,
) {
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
    run: (script: string) =>
      run({
        check,
        restart,
        runBrowser,
        config,
        script,
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
    'rejects unrelated script %s before any work',
    async (script) => {
      const f = fixture();
      await expect(f.run(script)).rejects.toThrow();
      expect(f.calls).toEqual([]);
      expect(Object.keys(f.stages)).toEqual(['owner']);
    },
  );

  it('the same blocking contract fails if the actual runtime dependency is removed', async () => {
    const source = await readFile(
      new URL('../../../scripts/browser-upload.mjs', import.meta.url),
      'utf8',
    );
    expect(source).toContain('[...dependencies, runtime]');
    const mutant = source
      .replace("import assert from 'node:assert/strict';", '')
      .replace('export async function', 'async function')
      .replace('[...dependencies, runtime]', '[...dependencies]');
    const run = runInNewContext(`${mutant}\nrunUploadBrowserStage`, { assert });
    const f = fixture({ restartError: true }, run);
    await expect(assertRestartFailureBlocked(f)).rejects.toThrow(
      /expected true to be false/,
    );
    expect(f.stages['upload-runtime'].status).toBe('failed');
    expect(f.stages.upload.status).toBe('passed');
    expect(f.calls[1].script).toBe('../e2e/upload.mjs');
  });
});

describe('actual runner upload dispatch', () => {
  it.each([
    ['upload-regression', undefined, ['upload', 'upload-polling']],
    ['upload-regression', 'main', ['upload']],
    ['upload-settings', undefined, []],
    ['upload-input', undefined, []],
    ['upload', undefined, []],
  ] as const)(
    'focused %s/%s only restarts applicable actual stages',
    async (suite, only, isolated) => {
      const source = await readFile(
        new URL('../../../scripts/verify-browser.mjs', import.meta.url),
        'utf8',
      );
      const start = source.indexOf(
        '      for (const [script, result] of plan.stages) {',
      );
      const end = source.indexOf('\n    }\n    assert.ok(', start);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      const f = fixture();
      const report: Record<string, string> = {};
      const plan = selectBrowserPlan({ suite, only, pageLabel: 'p1' });
      await runInNewContext(`(async () => { ${source.slice(start, end)} })()`, {
        plan,
        report,
        check: f.check,
        runBrowser: f.runBrowser,
        restartProduction: f.restart,
        focusedConfig: config,
        runUploadBrowserStage,
      });
      expect(f.calls.filter((call) => call.restart)).toHaveLength(
        isolated.length,
      );
      expect(
        Object.keys(f.stages).filter((name) => name.endsWith('-runtime')),
      ).toEqual(isolated.map((name) => `${name}-runtime`));
      expect(
        f.calls.filter((call) => call.script).map((call) => call.script),
      ).toEqual(
        plan.stages.map(([script]: string[]) => `../e2e/${script}.mjs`),
      );
    },
  );

  it('the actual full business closure applies owner dependencies and only isolates the two upload scripts', async () => {
    const source = await readFile(
      new URL('../../../scripts/verify-browser.mjs', import.meta.url),
      'utf8',
    );
    const start = source.indexOf(
      '      const business = (name, script, extra = {}) =>',
    );
    const end = source.indexOf('\n      if (width === 390)', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const f = fixture();
    const business = runInNewContext(
      `(() => { ${source.slice(start, end)}\nreturn business; })()`,
      {
        identityConfig: config,
        ownerName: 'owner',
        check: f.check,
        runBrowser: f.runBrowser,
        restartProduction: f.restart,
        runUploadBrowserStage,
      },
    );
    const plan = selectBrowserPlan({ suite: 'full', pageLabel: 'p1' });
    for (const [script, name] of plan.stages) await business(name, script);
    expect(
      Object.keys(f.stages).filter((name) => name.endsWith('-runtime')),
    ).toEqual(['upload-runtime', 'upload-polling-runtime']);
    expect(f.calls.filter((call) => call.restart)).toEqual([
      { restart: config.dataDirectory },
      { restart: config.dataDirectory },
    ]);
    expect(
      f.calls.filter((call) => call.script).map((call) => call.script),
    ).toEqual(plan.stages.map(([script]: string[]) => `../e2e/${script}.mjs`));
  });
});
