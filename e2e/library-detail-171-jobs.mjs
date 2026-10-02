import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  workspace,
  button,
  openDetail171,
  restoreDetail171Fetch,
  quote,
} from './library-detail-171-helpers.mjs';
import { verifyReprocessLayout } from './library-detail-171-layouts.mjs';

export async function verifyDetail171Jobs({ page, config, sql, report }) {
  const [active] = await sql("SELECT * FROM media_jobs WHERE id='active-job'");
  const [activeImage] = await sql(
    "SELECT processing_status FROM media_images WHERE id='library-002'",
  );
  const [candidateStorage] = await sql(
    "SELECT s.id,s.local_path FROM media_images i JOIN storage_configs s ON s.id=i.storage_id WHERE i.id='library-002'",
  );
  const candidateId = 'detail-171-render-candidate';
  const candidateKey = `library-fixtures/${candidateId}.png`;
  const candidatePath = join(
    config.dataDirectory,
    'storage',
    candidateStorage.local_path,
    'ariso',
    candidateStorage.id,
    candidateKey,
  );
  try {
    await openDetail171(page, config, 'library-002');
    assert.ok(
      await page.evaluate(() => {
        const workspace = document.querySelector(
          '[data-testid="detail-reprocess"]',
        );
        return (
          !workspace.dataset.jobStatus &&
          !workspace.textContent.includes('正在重新处理') &&
          !workspace.textContent.includes('任务已受理') &&
          workspace.textContent.includes('处理中') &&
          document.querySelector('[data-testid="reprocess-submit"]').disabled
        );
      }),
      'An initial processing task is never adopted as a reprocess receipt',
    );
    // These explicit persisted fixtures verify rendering/polling, not real worker results.
    await sql(
      "UPDATE media_images SET processing_status='ready' WHERE id='library-002'",
    );
    await sql(
      `UPDATE media_jobs SET status='queued',next_attempt_at=${Date.now() + 3600000},error=NULL WHERE id='active-job'`,
    );
    await openDetail171(page, config, 'library-002');
    await page.waitForSelector(`${workspace}[data-job-status="queued"]`);
    await verifyReprocessLayout(
      { page, config, report },
      'reprocess-fixture-queued',
    );
    const published = await sql(
      "SELECT kind,object_id FROM media_versions WHERE image_id='library-002' ORDER BY kind",
    );
    const candidateBytes = await readFile(
      join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
    );
    await writeFile(candidatePath, candidateBytes);
    await sql(
      `INSERT INTO media_objects (id,image_id,job_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) VALUES ('${candidateId}','library-002','active-job',${quote(candidateStorage.id)},${quote(candidateKey)},'compressed','stored',${candidateBytes.length},'png','image/png',${Date.now()},${Date.now()})`,
    );
    await sql(
      `UPDATE media_jobs SET status='running',scope='all',expected_versions='["compressed","thumbnail","watermark"]' WHERE id='active-job'`,
    );
    await openDetail171(page, config, 'library-002');
    await page.waitForSelector(`${workspace}[data-job-status="running"]`);
    await page.waitForFunction(() => {
      const rows = [
        ...document.querySelectorAll(
          '[data-testid="detail-reprocess"] dl > div',
        ),
      ];
      return (
        rows.length === 2 &&
        rows[0].textContent.includes('压缩图') &&
        rows[0].textContent.includes('候选已生成') &&
        rows[0].textContent.includes('尚未替换') &&
        rows[1].textContent.includes('缩略图 / 水印图') &&
        rows[1].textContent.includes('处理中') &&
        rows[1].textContent.includes('全部成功后一起替换')
      );
    });
    const rendered = JSON.parse(
      (await page.fetch('/api/images/library-002')).body,
    );
    assert.deepEqual(rendered.processingJob.generatedVersions, ['compressed']);
    assert.equal(
      rendered.versions.find((version) => version.kind === 'compressed').saved,
      false,
    );
    assert.deepEqual(
      await sql(
        "SELECT kind,object_id FROM media_versions WHERE image_id='library-002' ORDER BY kind",
      ),
      published,
      'Stored candidate does not change published version references',
    );
    await verifyReprocessLayout(
      { page, config, report },
      'reprocess-fixture-running',
    );
    await sql(
      "UPDATE media_jobs SET status='failed',error='controlled render verification failure' WHERE id='active-job'",
    );
    await page.waitForSelector(`${workspace}[data-job-status="failed"]`);
    assert.ok(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="reprocess-task-status"]')
          .textContent.includes('已有版本保留'),
      ),
    );
    await verifyReprocessLayout(
      { page, config, report },
      'reprocess-fixture-failed',
    );
    await page.click(button('按最新设置重试'));
    await page.waitForSelector(`${workspace} [role="radiogroup"]`);
    await sql(
      "UPDATE media_jobs SET status='running',error=NULL WHERE id='active-job'",
    );
    await openDetail171(page, config, 'library-002', '');
    await page.evaluate(() => {
      const original = window.fetch;
      window.__detail171Fetch = original;
      window.__detail171StatusFaultUsed = false;
      window.__detail171StatusRequests = [];
      window.fetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        const response = await original(...args);
        if (path === '/api/images/status') {
          const ids = JSON.parse(args[1].body).ids;
          window.__detail171StatusRequests.push(ids);
          if (
            ids.length === 1 &&
            ids[0] === 'library-002' &&
            !window.__detail171StatusFaultUsed
          ) {
            window.__detail171StatusFaultUsed = true;
            throw new TypeError('Verification: real status response lost');
          }
        }
        return response;
      };
    });
    await page.waitForSelector(button('重试任务状态'), { timeout: 10000 });
    const failedPolls = await page.evaluate(
      () => window.__detail171StatusRequests.length,
    );
    await page.waitForTimeout(2200);
    assert.equal(
      await page.evaluate(() => window.__detail171StatusRequests.length),
      failedPolls,
      'Status transport error stops automatic polling',
    );
    await page.focus(button('重试任务状态'));
    await page.keyboard.press('Enter');
    await page.waitForSelector(button('重试任务状态'), { state: 'hidden' });
    assert.ok(
      (await page.evaluate(() => window.__detail171StatusRequests.length)) >
        failedPolls,
    );
    for (const ids of await page.evaluate(
      () => window.__detail171StatusRequests,
    ))
      assert.deepEqual(ids, ['library-002']);
    report.checks.push(
      'Controlled persisted job (not queued to worker) renders single-thumbnail queued, then all-scope running with a real stored compressed fixture candidate: generated/not-yet-replaced and remaining thumbnail/watermark rows render separately while published object IDs stay fixed. This is rendering evidence, not real worker generation. Failed state keeps old versions, retry returns to current settings; losing a real current-ID status response stops polling and keyboard retry reads the real endpoint again.',
    );
  } finally {
    await restoreDetail171Fetch(page);
    await sql(
      `UPDATE media_jobs SET status=${quote(active.status)},scope=${quote(active.scope)},expected_versions=${quote(active.expected_versions)},error=${active.error === null ? 'NULL' : quote(active.error)},next_attempt_at=${active.next_attempt_at ?? 'NULL'} WHERE id='active-job'`,
    );
    await sql(
      `UPDATE media_images SET processing_status=${quote(activeImage.processing_status)} WHERE id='library-002'`,
    );
    await sql(`DELETE FROM media_objects WHERE id='${candidateId}'`);
    await rm(candidatePath, { force: true });
  }
}
