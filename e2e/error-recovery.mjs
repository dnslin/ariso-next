import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertNoBrowserErrors, readBrowserErrors } from './browser-errors.mjs';

// Only the runner's disposable production database is modified here.
export async function verifyErrorRecovery(page, config) {
  // Ego's embedded runtime cannot load unsigned native addons on macOS.
  // Use the same Node 24 executable and SQLite driver as the production runner.
  const sql = (statement) =>
    promisify(execFile)(
      config.nodeExecutable,
      [
        '--input-type=module',
        '-e',
        "import Database from 'better-sqlite3'; const db = new Database(process.argv[1]); try { db.exec(process.argv[2]); } finally { db.close(); }",
        config.databasePath,
        statement,
      ],
      { cwd: config.projectDirectory },
    );
  const report = { status: 'failed' };
  let renamed = false;
  try {
    await assertNoBrowserErrors(page);
    await sql('ALTER TABLE site_settings RENAME TO site_settings_fault');
    renamed = true;
    await page.goto(config.origin);
    await page.waitForSelector('loc=role:button[name="重试"]');
    assert.equal(
      await page.evaluate(() => document.querySelector('h1')?.textContent),
      '页面加载失败',
    );
    report.expectedErrors = await readBrowserErrors(page);
    assert.ok(
      report.expectedErrors.length > 0,
      'The injected server failure is recorded',
    );
    // React 19 production code 441 is the server-component render failure.
    // https://react.dev/errors/441
    for (const error of report.expectedErrors) {
      assert.equal(error.url, `${config.origin}/`);
      assert.equal(error.kind, 'console.error');
      assert.match(error.message, /^Error: Minified React error #441;/);
    }
    await sql('ALTER TABLE site_settings_fault RENAME TO site_settings');
    renamed = false;
    await page.click('loc=role:button[name="重试"]');
    await page.waitForSelector('#home-heading', { timeout: 10000 });
    assert.equal(
      await page.evaluate(
        () => document.querySelector('#home-heading').textContent,
      ),
      'Ariso',
    );
    assert.equal(await page.url(), `${config.origin}/`);
    await assertNoBrowserErrors(page);
    report.status = 'passed';
    report.check =
      'Database read failure → restore database → click retry → home recovered without reload';
  } catch (error) {
    report.error = error.stack ?? String(error);
    throw error;
  } finally {
    try {
      if (renamed)
        await sql('ALTER TABLE site_settings_fault RENAME TO site_settings');
    } finally {
      await writeFile(
        join(config.output, 'error-recovery.json'),
        `${JSON.stringify(report, null, 2)}\n`,
      );
    }
  }
  return report;
}
