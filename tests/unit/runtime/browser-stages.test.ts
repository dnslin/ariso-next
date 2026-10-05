import { describe, expect, it } from 'vitest';
import { runBrowserStage } from '../../../scripts/browser-stages.mjs';

describe('browser stage execution', () => {
  it('records a failure, observes recovery and still executes later independent stages', async () => {
    const stages: Record<string, { status: string; error?: string }> = {};
    const calls: string[] = [];
    const recover = async () => {
      calls.push('observe');
    };
    await runBrowserStage(
      stages,
      'first',
      async () => {
        calls.push('first');
        throw new Error('real assertion failed');
      },
      recover,
    );
    await runBrowserStage(
      stages,
      'second',
      async () => {
        calls.push('second');
      },
      recover,
    );
    expect(calls).toEqual(['first', 'observe', 'second']);
    expect(stages.first).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('real assertion failed'),
    });
    expect(stages.second.status).toBe('passed');
    expect(
      Object.values(stages).every((stage) => stage.status === 'passed'),
    ).toBe(false);
  });

  it('blocks only a real dependent stage, then runs an independent fixture', async () => {
    const stages: Record<string, { status: string; blockedBy?: string[] }> = {};
    const calls: string[] = [];
    await runBrowserStage(
      stages,
      'before-restart',
      async () => {
        throw new Error('no saved restart job');
      },
      async () => {},
    );
    await runBrowserStage(
      stages,
      'after-restart',
      async () => {
        calls.push('after-restart');
      },
      async () => {},
      ['before-restart'],
    );
    await runBrowserStage(
      stages,
      'other-fixture',
      async () => {
        calls.push('other-fixture');
      },
      async () => {},
    );
    expect(calls).toEqual(['other-fixture']);
    expect(stages['after-restart']).toEqual({
      status: 'blocked',
      blockedBy: ['before-restart'],
    });
    expect(stages['other-fixture'].status).toBe('passed');
  });

  it.each(['user takeover', 'inactive space', 'cancelled'])(
    'stops the pipeline when recovery reports %s',
    async (reason) => {
      const stages: Record<string, { status: string }> = {};
      const calls: string[] = [];
      const pipeline = async () => {
        await runBrowserStage(
          stages,
          'first',
          async () => {
            throw new Error('scene failed');
          },
          async () => {
            throw new Error(reason);
          },
        );
        await runBrowserStage(
          stages,
          'second',
          async () => {
            calls.push('second');
          },
          async () => {},
        );
      };
      await expect(pipeline()).rejects.toThrow(reason);
      expect(calls).toEqual([]);
      expect(stages.first.status).toBe('failed');
      expect(stages).not.toHaveProperty('second');
    },
  );
});
