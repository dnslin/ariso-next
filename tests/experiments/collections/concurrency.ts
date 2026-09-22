import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import type Database from 'better-sqlite3';
import type { Operation, Tag } from './database.ts';

type Outcome = { input: Operation; pid: number; lockProbe: string } & (
  { status: 'success'; row: Tag } | { status: 'conflict'; code: string }
);

export async function compete(
  db: Database.Database,
  path: string,
  operations: Operation[],
) {
  const children = operations.map((operation) =>
    fork(
      new URL('./contender.ts', import.meta.url),
      [path, JSON.stringify(operation)],
      { execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
    ),
  );
  let timer: NodeJS.Timeout | undefined;
  try {
    return await new Promise<Outcome[]>((resolve, reject) => {
      const outcomes: Outcome[] = [];
      let ready = 0;
      let contended = 0;
      let exited = 0;
      timer = setTimeout(
        () => reject(new Error('SQLite contenders timed out')),
        15_000,
      );
      for (const child of children) {
        let stderr = '';
        child.stderr!.on('data', (chunk) => {
          stderr += chunk;
        });
        child.on('error', reject);
        child.on('message', (message: { type: string; outcome: Outcome }) => {
          try {
            if (message.type === 'ready' && ++ready === children.length) {
              db.exec('BEGIN IMMEDIATE');
              for (const contender of children) contender.send('start');
            }
            if (message.type === 'contended' && ++contended === children.length)
              db.exec('COMMIT');
            if (message.type === 'result') outcomes.push(message.outcome);
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
          if (++exited === children.length) {
            try {
              assert.equal(outcomes.length, operations.length);
              assert.equal(contended, operations.length);
              resolve(outcomes);
            } catch (error) {
              reject(error);
            }
          }
        });
      }
    });
  } finally {
    clearTimeout(timer);
    if (db.inTransaction) db.exec('ROLLBACK');
    await Promise.all(
      children.map((child) => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        return new Promise<void>((resolve) => {
          child.once('exit', () => resolve());
          child.kill();
        });
      }),
    );
  }
}
