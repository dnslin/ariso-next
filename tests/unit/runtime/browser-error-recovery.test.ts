import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { expect, it } from 'vitest';
import { readProductionMigrations } from '../../fixtures/runtime/migrations';
import { readSetupOwner } from '../../../src/server/identity/setup';
import { readSiteSettings } from '../../../src/server/site/settings';
import { verifyErrorRecovery } from '../../../e2e/error-recovery.mjs';

// Native SQLite and the production readers are real. Page navigation is a unit
// double; actual Next error rendering and React 441 remain browser acceptance.
async function fixture(
  options: { failAtBoundary?: boolean; reloadOnRetry?: boolean } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-recovery-harness-'));
  const databasePath = join(directory, 'ariso.db');
  const sqlite = new Database(databasePath);
  for (const migration of readProductionMigrations())
    sqlite.exec(migration.sql);
  const db = drizzle(sqlite);
  const origin = 'http://recovery.localhost';
  let path = '/',
    failed = false;
  let events: object[] = [];
  const context = createContext({
    document: {
      querySelector: (selector: string) => ({
        textContent:
          selector === 'h1' && failed
            ? '页面加载失败'
            : path === '/'
              ? 'Ariso'
              : '欢迎使用 Ariso',
      }),
    },
  });
  runInContext('window = globalThis', context);
  const page = {
    goto: async () => {
      readSiteSettings(db);
      path = '/';
      failed = false;
      runInContext('window.__errorRecoveryDocument = undefined', context);
    },
    url: async () => `${origin}${path}`,
    events: async () => {
      const batch = events;
      events = [];
      return batch;
    },
    evaluate: async (callback: { toString(): string }, argument?: unknown) =>
      structuredClone(
        runInContext(
          `(${callback.toString()})(${JSON.stringify(argument) ?? 'undefined'})`,
          context,
        ),
      ),
    waitForSelector: async (selector: string) => {
      readSiteSettings(db);
      if (selector.includes('重试')) {
        if (options.failAtBoundary)
          throw new Error('boundary verification failed');
        expect(failed).toBe(true);
      } else if (selector === '#setup-heading') {
        expect(path).toBe('/setup');
        expect(failed).toBe(false);
      } else expect(path).toBe('/');
    },
    click: async (selector: string) => {
      readSiteSettings(db);
      if (selector === 'a[href="/setup"]') {
        path = '/setup';
        expect(() => readSetupOwner(db, databasePath)).toThrow(
          /no such table: user/,
        );
        failed = true;
        events.push({
          method: 'Runtime.bindingCalled',
          params: {
            name: '__arisoReportError',
            payload: JSON.stringify({
              url: `${origin}/setup`,
              kind: 'console.error',
              message:
                'Error: Minified React error #441; server component failed',
            }),
          },
        });
      } else if (selector.includes('返回首页')) {
        path = '/';
      } else {
        expect(readSetupOwner(db, databasePath)).toBeNull();
        failed = false;
        if (options.reloadOnRetry)
          runInContext('window.__errorRecoveryDocument = undefined', context);
      }
    },
  };
  const config = {
    nodeExecutable: process.execPath,
    projectDirectory: process.cwd(),
    databasePath,
    origin,
    output: directory,
  };
  return {
    page,
    config,
    db,
    async report() {
      return JSON.parse(
        await readFile(join(directory, 'error-recovery.json'), 'utf8'),
      );
    },
    async dispose() {
      sqlite.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

it('keeps root branding readable while a real page reader fails, then restores that page in the same document', async () => {
  const f = await fixture();
  try {
    const report = await verifyErrorRecovery(f.page, f.config);
    expect(report.status).toBe('passed');
    expect((await f.report()).expectedErrors).toHaveLength(1);
    expect(readSiteSettings(f.db)).toBeNull();
    expect(readSetupOwner(f.db, f.config.databasePath)).toBeNull();
  } finally {
    await f.dispose();
  }
});

it('restores the actual user table and writes a failed report when boundary verification aborts', async () => {
  const f = await fixture({ failAtBoundary: true });
  try {
    await expect(verifyErrorRecovery(f.page, f.config)).rejects.toThrow(
      'boundary verification failed',
    );
    expect(readSetupOwner(f.db, f.config.databasePath)).toBeNull();
    expect(readSiteSettings(f.db)).toBeNull();
    expect((await f.report()).status).toBe('failed');
  } finally {
    await f.dispose();
  }
});

it('rejects a full reload masquerading as same-document retry recovery', async () => {
  const f = await fixture({ reloadOnRetry: true });
  try {
    await expect(verifyErrorRecovery(f.page, f.config)).rejects.toThrow(
      'same document',
    );
    expect((await f.report()).status).toBe('failed');
    expect(readSetupOwner(f.db, f.config.databasePath)).toBeNull();
  } finally {
    await f.dispose();
  }
});
