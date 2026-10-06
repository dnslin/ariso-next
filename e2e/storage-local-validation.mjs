import assert from 'node:assert/strict';
import { join } from 'node:path';
import { storageLayouts } from './storage-admin-layout.mjs';

/** Exercise an invalid Local path while observing the real PATCH and preserving input. */
export async function runStorageLocalValidation({
  page,
  config,
  report,
  local,
  storage,
}) {
  await page.fill('input[name="localPath"]', '../../outside-storage');
  await page.evaluate((id) => {
    const original = window.fetch;
    window.__storageLocalPathDiagnostic = [];
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      if (path !== `/api/storages/${id}` || args[1]?.method !== 'PATCH')
        return original(...args);
      const row = { path, startedAt: Date.now() };
      window.__storageLocalPathDiagnostic.push(row);
      try {
        const response = await original(...args);
        row.status = response.status;
        return response;
      } finally {
        row.finishedAt = Date.now();
      }
    };
    window.__restoreStorageLocalPathDiagnostic = () => {
      window.fetch = original;
      delete window.__restoreStorageLocalPathDiagnostic;
    };
  }, local.id);
  try {
    await page.click('[data-testid="storage-save"]');
    await page.waitForSelector('[role="alert"]');
  } catch (error) {
    await page.screenshot({
      path: join(config.output, 'storage-admin-local-path-failure.png'),
    });
    throw error;
  } finally {
    try {
      report.localPathDiagnostic = {
        ...(await page.evaluate(() => ({
          requests: window.__storageLocalPathDiagnostic,
          input: document.querySelector('input[name="localPath"]')?.value,
          alerts: [
            ...document.querySelectorAll('[data-slot="alert-root"]'),
          ].map((node) => ({
            role: node.getAttribute('role'),
            text: node.textContent.trim(),
          })),
        }))),
        storedPath: (await storage(local.id)).localPath,
      };
    } finally {
      await page.evaluate(() => {
        window.__restoreStorageLocalPathDiagnostic?.();
        delete window.__storageLocalPathDiagnostic;
      });
    }
  }
  assert.equal(
    await page.evaluate(
      () => document.querySelector('input[name="localPath"]').value,
    ),
    '../../outside-storage',
  );
  assert.equal((await storage(local.id)).localPath, 'storage-admin-198');
  await storageLayouts(page, config, report, 'local-field-error', [1440, 390]);
}
