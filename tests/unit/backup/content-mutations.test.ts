import { describe, expect, it } from 'vitest';
import { createContentMutations } from '../../../src/server/runtime/content-mutations.ts';

describe('content mutation admission', () => {
  it('rejects new writes while allowing an admitted request to settle', async () => {
    const gate = createContentMutations();
    const pending = Promise.withResolvers<number>();
    const accepted = gate.run('upload', () => pending.promise);
    gate.closeAdmission();
    let wrote = false;
    await expect(
      gate.run('delete', () => {
        wrote = true;
      }),
    ).rejects.toMatchObject({
      code: 'SITE_BACKUP_IN_PROGRESS',
      status: 409,
    });
    expect(wrote).toBe(false);
    expect(gate.activeCount).toBe(1);
    let idle = false;
    const waiting = gate.waitForIdle().then(() => {
      idle = true;
    });
    await Promise.resolve();
    expect(idle).toBe(false);
    pending.resolve(42);
    expect(await accepted).toBe(42);
    await waiting;
    expect(gate.activeCount).toBe(0);
    gate.openAdmission();
    expect(await gate.run('rename', () => 'saved')).toBe('saved');
  });

  it('releases activity after synchronous and asynchronous failures', async () => {
    const gate = createContentMutations();
    const failure = new Error('write failed');
    await expect(
      gate.run('sync', () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    await expect(gate.run('async', () => Promise.reject(failure))).rejects.toBe(
      failure,
    );
    expect(gate.activeCount).toBe(0);
    await gate.waitForIdle();
  });

  it('cancelling the idle wait does not cancel the accepted write', async () => {
    const gate = createContentMutations();
    const pending = Promise.withResolvers<string>();
    const accepted = gate.run('upload', () => pending.promise);
    const controller = new AbortController();
    const reason = new Error('backup cancelled');
    const waiting = gate.waitForIdle(controller.signal);
    controller.abort(reason);
    await expect(waiting).rejects.toBe(reason);
    expect(gate.activeCount).toBe(1);
    pending.resolve('complete');
    expect(await accepted).toBe('complete');
  });
});
