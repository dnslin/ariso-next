import assert from 'node:assert/strict';
import { limitsField, limitsId } from './upload-settings-helpers.mjs';
import { resizeViewport } from './browser-geometry.mjs';

export async function uploadSettingsBehavior(page, config, tools, report) {
  const step = (name, detail) => {
    report.behaviorStep = { name, ...detail };
  };
  try {
    step('open');
    await tools.open();
    await tools.monitor();
    const before = await tools.request('/api/settings/upload');
    for (const [input, first] of [
      [{ maxFileMiB: 0, batchSize: 201, queueLimit: 99 }, 'maxFileMiB'],
      [{ maxFileMiB: 1.5, batchSize: 1, queueLimit: 100 }, 'maxFileMiB'],
      [{ maxFileMiB: 50, batchSize: 150, queueLimit: 100 }, 'batchSize'],
    ]) {
      step('local-validation-fill', { input, first });
      await tools.fill(input);
      step('local-validation-submit', { input, first });
      await page.click(limitsId('save'));
      step('local-validation-error', { input, first });
      await page.waitForSelector(`${limitsField(first)}[aria-invalid="true"]`);
      step('local-validation-focus', { input, first });
      await page.waitForFunction(
        (selector) =>
          document.activeElement === document.querySelector(selector),
        limitsField(first),
      );
      assert.deepEqual(
        await tools.inputs(),
        Object.fromEntries(
          Object.entries(input).map(([name, value]) => [name, String(value)]),
        ),
      );
      assert.equal(
        await page.evaluate(
          (selector) =>
            document.activeElement === document.querySelector(selector),
          limitsField(first),
        ),
        true,
        'First erroneous visible input receives focus',
      );
      assert.equal(
        (await tools.browser()).requests.filter((r) => r.method === 'PATCH')
          .length,
        0,
        'Local invalid input makes no mutation',
      );
      assert.deepEqual(await tools.request('/api/settings/upload'), before);
      if (input.maxFileMiB === 0)
        for (const width of [1440, 390])
          await tools.evidence('field-error', width);
      if (first === 'batchSize')
        for (const width of [1440, 390])
          await tools.evidence('batch-over-queue', width, 'dark');
    }
    for (const input of [
      { maxFileMiB: 1, batchSize: 1, queueLimit: 100 },
      {
        maxFileMiB: Math.floor(Number.MAX_SAFE_INTEGER / 1048576),
        batchSize: 200,
        queueLimit: 2000,
      },
      { maxFileMiB: 50, batchSize: 20, queueLimit: 500 },
    ]) {
      step('valid-boundary-fill', { input });
      await tools.fill(input);
      step('valid-boundary-save', { input });
      await tools.save();
      const saved = await tools.request('/api/settings/upload');
      assert.deepEqual(saved, {
        ...input,
        maxFileBytes: input.maxFileMiB * 1048576,
      });
      assert.equal(new URL(await page.url()).pathname, '/settings/general');
      assert.deepEqual(
        await tools.inputs(),
        Object.fromEntries(
          Object.entries(input).map(([name, value]) => [name, String(value)]),
        ),
      );
    }
    step('enter-save-fill');
    await resizeViewport(page, 390, 560);
    await tools.fill({ maxFileMiB: 51 });
    await page.focus(limitsField('maxFileMiB'));
    await page.evaluate(() =>
      document
        .querySelector('.shell-content')
        .scrollTo({ top: 100, behavior: 'instant' }),
    );
    step('enter-save-scroll');
    await page.waitForFunction(
      () => document.querySelector('.shell-content').scrollTop > 0,
    );
    const beforeScroll = await page.evaluate(() => ({
      window: scrollY,
      content: document.querySelector('.shell-content').scrollTop,
    }));
    await page.keyboard.press('Enter');
    step('enter-save-notification');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-slot="toast-title"]')].some(
        (node) => node.textContent === '上传限制已保存',
      ),
    );
    await page.mouse.move(5, 5);
    step('enter-save-toast-animation');
    await page.waitForFunction(() => {
      const toast = document.querySelector(
        '[data-slot="toast"][data-frontmost="true"]',
      );
      return (
        toast &&
        !toast.hasAttribute('data-entering') &&
        !toast.hasAttribute('data-exiting') &&
        toast
          .getAnimations({ subtree: true })
          .every((animation) => animation.playState !== 'running')
      );
    });
    assert.equal(
      (await tools.request('/api/settings/upload')).maxFileMiB,
      51,
      'Enter commits current NumberField value',
    );
    const feedback = await page.evaluate(() => {
      const footer = document
        .querySelector('.shell-footer')
        .getBoundingClientRect();
      const toast = document.querySelector(
        '[data-slot="toast"][data-frontmost="true"]',
      );
      return {
        footerTop: footer.top,
        toastBottom: toast.getBoundingClientRect().bottom,
        variant: toast.classList.contains('toast--default')
          ? 'default'
          : toast.className,
        input: document.activeElement.closest('[data-field]')?.dataset.field,
      };
    });
    assert.equal(feedback.variant, 'default');
    assert.ok(
      feedback.toastBottom <= feedback.footerTop,
      'Neutral notification leaves footer clear',
    );
    assert.equal(feedback.input, 'maxFileMiB', 'Success retains focused field');
    const afterScroll = await page.evaluate(() => ({
      window: scrollY,
      content: document.querySelector('.shell-content').scrollTop,
    }));
    assert.deepEqual(
      afterScroll,
      beforeScroll,
      'Successful save retains scroll positions',
    );
    report.saveInteraction = {
      beforeScroll,
      afterScroll,
      focusedField: feedback.input,
    };
    await tools.evidence('saved-short', 390, 'light', 560);
    step('reload-saved-value');
    await page.reload();
    await page.waitForSelector(`${limitsId('editor')}[data-state="ready"]`);
    assert.equal(
      (await tools.inputs()).maxFileMiB,
      '51',
      'Reload reads actual saved value',
    );

    await tools.monitor({ validation: true });
    step('server-validation-fill');
    await tools.fill({ maxFileMiB: 52 });
    await page.click(limitsId('save'));
    step('server-validation-error');
    await page.waitForSelector(
      `${limitsField('maxFileMiB')}[aria-invalid="true"]`,
    );
    assert.equal((await tools.inputs()).maxFileMiB, '52');
    assert.equal((await tools.request('/api/settings/upload')).maxFileMiB, 51);
    const refused = (await tools.browser()).requests.find(
      (r) => r.method === 'PATCH',
    );
    assert.equal(refused.status, 422);
    assert.equal(refused.response.fields[0].field, 'maxFileMiB');
    report.checks.push(
      'Integers, joint boundaries, safe byte conversion, Enter save, real 422, reload, neutral same-page feedback',
    );

    // Real HTTP submissions retain their own limits. The integration suite also
    // restarts the actual standalone process and verifies these snapshots.
    const prefix = `limits-browser-${Date.now()}`;
    const submission = (requestId, count, declaredSize) => ({
      requestId,
      files: Array.from({ length: count }, (_, index) => ({
        queueItemId: `${requestId}-${index}`,
        originalName: 'limits.png',
        declaredSize,
      })),
    });
    try {
      step('submission-baseline');
      await tools.request('/api/settings/upload', 'PATCH', {
        maxFileMiB: 50,
        batchSize: 20,
        queueLimit: 500,
      });
      const old = await tools.request(
        '/api/uploads/submissions',
        'POST',
        submission(`${prefix}-old`, 21, 2 * 1048576),
      );
      step('submission-new-editor');
      await tools.open();
      await tools.monitor();
      await tools.fill({ maxFileMiB: 1, batchSize: 1, queueLimit: 100 });
      report.newSubmissionEdit = { inputs: await tools.inputs() };
      assert.deepEqual(report.newSubmissionEdit.inputs, {
        maxFileMiB: '1',
        batchSize: '1',
        queueLimit: '100',
      });
      step('submission-new-save');
      await tools.save();
      report.newSubmissionEdit.requests = (await tools.browser()).requests;
      report.newSubmissionEdit.saved = await tools.request(
        '/api/settings/upload',
      );
      step('submission-snapshot-verification');
      const next = await tools.request(
        '/api/uploads/submissions',
        'POST',
        submission(`${prefix}-new`, 2, 1048576),
      );
      assert.equal(old.maxFileBytes, 50 * 1048576);
      assert.equal(old.batchSize, 20);
      assert.deepEqual(
        old.sessions.map((s) => s.groupIndex),
        [...Array(20).fill(0), 1],
      );
      assert.equal(next.maxFileBytes, 1048576);
      assert.equal(next.batchSize, 1);
      assert.deepEqual(
        next.sessions.map((s) => s.groupIndex),
        [0, 1],
      );
      assert.deepEqual(
        await tools.request(`/api/uploads/submissions/${old.id}`),
        old,
      );
      const rows = await tools.sql(
        `SELECT request_id,queue_limit FROM upload_submissions WHERE request_id LIKE '${prefix}-%' ORDER BY request_id`,
      );
      assert.deepEqual(
        rows.map((row) => row.queue_limit),
        [100, 500],
      );
      const mutations = (await tools.browser()).requests.filter(
        (r) => r.method === 'PATCH',
      );
      assert.deepEqual(
        mutations.map((r) => r.path),
        ['/api/settings/upload'],
      );
      assert.deepEqual(mutations[0].body, {
        maxFileMiB: 1,
        batchSize: 1,
        queueLimit: 100,
      });
      report.checks.push(
        'UI saves upload-owned fields only; old/new real submissions preserve byte, batch and queue snapshots',
      );
    } finally {
      const rows = await tools.sql(
        `SELECT id FROM upload_sessions WHERE submission_id IN (SELECT id FROM upload_submissions WHERE request_id LIKE '${prefix}-%')`,
      );
      for (const { id } of rows)
        await tools.request(`/api/uploads/sessions/${id}`, 'DELETE');
      await tools.sql(
        `DELETE FROM upload_sessions WHERE submission_id IN (SELECT id FROM upload_submissions WHERE request_id LIKE '${prefix}-%')`,
      );
      await tools.sql(
        `DELETE FROM upload_submissions WHERE request_id LIKE '${prefix}-%'`,
      );
    }
    step('complete');
  } catch (error) {
    try {
      report.behaviorFailure = await page.evaluate(() => {
        const editor = document.querySelector(
          '[data-testid="upload-limits-editor"]',
        );
        const form = document.querySelector('#upload-limits-form');
        return {
          path: location.pathname,
          state: editor?.dataset,
          inputs: [
            ...document.querySelectorAll(
              '#upload-limits-form input:not([type="hidden"])',
            ),
          ].map((input) => ({
            field: input.closest('[data-field]')?.dataset.field,
            value: input.value,
            invalid: input.getAttribute('aria-invalid'),
            disabled: input.disabled,
          })),
          submittedValues: form ? Object.fromEntries(new FormData(form)) : null,
          active: {
            tag: document.activeElement?.tagName,
            id: document.activeElement?.id,
            field:
              document.activeElement?.closest('[data-field]')?.dataset.field,
          },
          saveDisabled: document.querySelector(
            '[data-testid="upload-limits-save"]',
          )?.disabled,
          scroll: {
            window: scrollY,
            content: document.querySelector('.shell-content')?.scrollTop,
          },
          requests: window.__limitsBrowser?.requests,
          errors: document.querySelector('#upload-limits-errors')?.textContent,
          toasts: [
            ...document.querySelectorAll('[data-slot="toast-title"]'),
          ].map((node) => node.textContent),
        };
      });
    } catch (diagnosticError) {
      report.behaviorDiagnosticError = String(diagnosticError);
    }
    throw error;
  }
}
