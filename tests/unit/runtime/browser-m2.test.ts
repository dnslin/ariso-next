import { describe, expect, it } from 'vitest';
import { runM2Restart } from '../../../scripts/browser-m2.mjs';
import { runBrowserStage } from '../../../scripts/browser-stages.mjs';

const config = {
  width: 390,
  dataDirectory: '/test/data',
  spaceId: 1,
  pageLabel: 'p1',
};

function fixture({
  beforeError,
  restartCodes = [],
  ownerReady = true,
}: {
  beforeError?: Error;
  restartCodes?: string[];
  ownerReady?: boolean;
} = {}) {
  const stages: Record<string, { status: string; blockedBy?: string[] }> = {
    owner: { status: ownerReady ? 'passed' : 'failed' },
  };
  const calls: unknown[] = [];
  const check = (
    name: string,
    operation: () => Promise<void>,
    dependencies: string[] = [],
  ) =>
    runBrowserStage(
      stages,
      name,
      operation,
      async () => {
        calls.push('observe');
      },
      dependencies,
    );
  const run = () =>
    runM2Restart({
      check,
      config,
      dependencies: ['owner'],
      runBrowser: async (
        script: string,
        input: Record<string, unknown>,
        log: string,
      ) => {
        calls.push({ script, input, log });
        if (input.phase === 'before' && beforeError) throw beforeError;
      },
      restart: async (dataDirectory: string) => {
        calls.push({ restart: dataDirectory });
        return restartCodes;
      },
    });
  return { stages, calls, check, run };
}

describe('shared M2 restart sequence', () => {
  it('runs both scenes around one restart of the same data directory', async () => {
    const f = fixture();
    await f.run();
    expect(f.calls).toEqual([
      {
        script: '../e2e/m2.mjs',
        input: { ...config, phase: 'before' },
        log: 'm2-390-before.log',
      },
      { restart: config.dataDirectory },
      {
        script: '../e2e/m2.mjs',
        input: { ...config, phase: 'after' },
        log: 'm2-390-after.log',
      },
    ]);
    expect(f.stages['m2-390-before'].status).toBe('passed');
    expect(f.stages['m2-390-after'].status).toBe('passed');
  });

  it('blocks after without restarting when before fails, then allows independent work', async () => {
    const f = fixture({ beforeError: new Error('job was not saved') });
    await f.run();
    await f.check('independent', async () => {
      f.calls.push('independent');
    });
    expect(f.calls).toEqual([
      {
        script: '../e2e/m2.mjs',
        input: { ...config, phase: 'before' },
        log: 'm2-390-before.log',
      },
      'observe',
      'independent',
    ]);
    expect(f.stages['m2-390-after']).toEqual({
      status: 'blocked',
      blockedBy: ['m2-390-before'],
    });
    expect(f.stages.independent.status).toBe('passed');
  });

  it('honors the full-flow owner dependency before invoking either scene', async () => {
    const f = fixture({ ownerReady: false });
    await f.run();
    expect(f.calls).toEqual([]);
    expect(f.stages['m2-390-before']).toEqual({
      status: 'blocked',
      blockedBy: ['owner'],
    });
    expect(f.stages['m2-390-after']).toEqual({
      status: 'blocked',
      blockedBy: ['m2-390-before'],
    });
  });

  it('rejects a fresh setup code before running the after scene', async () => {
    const f = fixture({ restartCodes: ['unexpected-code'] });
    await f.run();
    expect(f.calls).toEqual([
      {
        script: '../e2e/m2.mjs',
        input: { ...config, phase: 'before' },
        log: 'm2-390-before.log',
      },
      { restart: config.dataDirectory },
      'observe',
    ]);
    expect(f.stages['m2-390-after']).toMatchObject({
      status: 'failed',
      error: expect.stringContaining(
        'Initialized restart must not issue another code',
      ),
    });
  });
});
