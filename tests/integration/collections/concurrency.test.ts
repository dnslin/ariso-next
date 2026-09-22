import { fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { tags } from '../../../src/server/collections/schema.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import type { Outcome } from '../../fixtures/collections/contender.ts';

it('T-COL-01: competing production upload preparations keep one tag ID and the first successful display name', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ariso-collections-race-'));
  const path = join(directory, 'ariso.db');
  const connection = openRuntimeDatabase(path);
  const db = connection.db;
  const children: ReturnType<typeof fork>[] = [];
  let timer: NodeJS.Timeout | undefined;
  try {
    migrateRuntimeDatabase(db, resolve('drizzle'));
    const inputs = ['Go', 'go', 'GO'];
    const outcomes = await new Promise<Outcome[]>((resolve, reject) => {
      const results: Outcome[] = [];
      const ready = new Set<number>();
      const contended = new Set<number>();
      let exited = 0;
      timer = setTimeout(
        () => reject(new Error('Production collection contenders timed out')),
        15_000,
      );
      for (const input of inputs) {
        const child = fork(
          new URL('../../fixtures/collections/contender.ts', import.meta.url),
          [path, input],
          { execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
        );
        children.push(child);
        let stderr = '';
        child.stderr!.on('data', (chunk) => {
          stderr += chunk;
        });
        child.on('error', reject);
        child.on('message', (message: { type: string; outcome: Outcome }) => {
          try {
            if (message.type === 'ready') {
              ready.add(child.pid!);
              if (ready.size === inputs.length) {
                db.$client.exec('BEGIN IMMEDIATE');
                for (const contender of children) contender.send('start');
              }
            }
            if (message.type === 'contended') {
              contended.add(child.pid!);
              if (contended.size === inputs.length) db.$client.exec('COMMIT');
            }
            if (message.type === 'result') results.push(message.outcome);
          } catch (error) {
            reject(error);
          }
        });
        child.on('exit', (code, signal) => {
          if (code !== 0) {
            reject(
              new Error(`Contender ${child.pid}: ${code ?? signal}\n${stderr}`),
            );
            return;
          }
          if (++exited === inputs.length) {
            try {
              expect(contended.size).toBe(inputs.length);
              expect(results).toHaveLength(inputs.length);
              resolve(results);
            } catch (error) {
              reject(error);
            }
          }
        });
      }
    });
    expect(new Set(outcomes.map((result) => result.pid)).size).toBe(3);
    expect(outcomes.every((result) => result.pid !== process.pid)).toBe(true);
    expect(outcomes.map((result) => result.input).sort()).toEqual(
      inputs.sort(),
    );
    expect(outcomes.every((result) => result.lockProbe === 'SQLITE_BUSY')).toBe(
      true,
    );
    const winners = outcomes.filter((result) => result.firstWriter);
    expect(winners).toHaveLength(1);
    const winner = winners[0];
    expect(winner.tag.displayName).toBe(winner.input);
    expect(winner.tag.normalizedKey).toBe('go');
    for (const result of outcomes) expect(result.tag).toEqual(winner.tag);
    expect(db.select().from(tags).all()).toEqual([
      expect.objectContaining(winner.tag),
    ]);
  } finally {
    clearTimeout(timer);
    if (db.$client.inTransaction) db.$client.exec('ROLLBACK');
    await Promise.all(
      children.map((child) => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        return new Promise<void>((resolve) => {
          child.once('exit', () => resolve());
          child.kill('SIGKILL');
        });
      }),
    );
    connection.close();
    rmSync(directory, { recursive: true, force: true });
  }
}, 20_000);
