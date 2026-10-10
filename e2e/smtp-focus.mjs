import assert from 'node:assert/strict';
import { smtpControl, smtpFill, smtpValue } from './smtp-page.mjs';
import { smtpTransport } from './smtp-transport.mjs';

/** Widen the existing save-completion/focus race without changing any response. */
export async function verifySmtpSaveFocus(page, ui, report) {
  const savedName = '保存后继续编辑';
  const dirtyName = '继续编辑但尚未保存';
  await smtpFill(page, 'from-name', savedName);
  await page.waitForFunction(
    (selector) => !document.querySelector(selector).disabled,
    smtpControl('save'),
  );
  const transport = await smtpTransport(page, { method: 'PATCH', hold: true });
  let framesHeld = false;
  async function releaseFrames() {
    if (!framesHeld) return;
    framesHeld = false;
    await page.evaluate(() => {
      const state = window.__smtpFocusFrames;
      window.requestAnimationFrame = state.request;
      window.cancelAnimationFrame = state.cancel;
      delete window.__smtpFocusFrames;
      for (const callback of state.queued.values()) callback(performance.now());
    });
  }
  try {
    await ui.activate('save');
    const written = await transport.settled('PATCH');
    assert.equal(written.responses.at(-1).status, 200);
    await page.waitForSelector(
      `${smtpControl('page')}[data-operation="saving"]`,
    );
    await page.evaluate(() => {
      const state = {
        request: window.requestAnimationFrame,
        cancel: window.cancelAnimationFrame,
        queued: new Map(),
        next: -1,
      };
      window.__smtpFocusFrames = state;
      window.requestAnimationFrame = (callback) => {
        const id = state.next--;
        state.queued.set(id, callback);
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        if (id < 0) state.queued.delete(id);
        else state.cancel.call(window, id);
      };
    });
    framesHeld = true;
    await transport.release();
    await page.waitForSelector(`${smtpControl('page')}[data-operation="idle"]`);
    assert.equal(await smtpValue(page, 'from-name'), savedName);
    await page.waitForFunction(
      (selector) => document.querySelector(selector).disabled,
      smtpControl('save'),
    );
    await smtpFill(page, 'from-name', dirtyName);
    await page.waitForFunction(
      (selector) => !document.querySelector(selector).disabled,
      smtpControl('save'),
    );
    await page.focus(smtpControl('test'));
    const sourceFocus = await page.evaluate(
      (selector) => document.activeElement === document.querySelector(selector),
      smtpControl('test'),
    );
    assert.equal(sourceFocus, true);
    await releaseFrames();
    const focus = await page.evaluate(() => ({
      width: innerWidth,
      testId: document.activeElement?.getAttribute('data-testid'),
      id: document.activeElement?.id,
    }));
    report.focusTransitions ??= [];
    report.focusTransitions.push({
      name: 'save-then-edit-and-test',
      source: 'smtp-test',
      afterCompletionFrames: focus,
    });
    assert.equal(
      focus.testId,
      'smtp-test',
      'A completed save must not steal focus from the next chosen action',
    );
    await page.keyboard.press('Enter');
    await page.waitForSelector(smtpControl('dialog-test-confirm'));
    await ui.screenshot(`save-focus-${focus.width}`);
    assert.equal(
      (await transport.observed()).requests.some(
        (request) => request.method === 'POST',
      ),
      false,
      'Keyboard opening the dirty-form confirmation sends no test mail',
    );
    await page.keyboard.press('Escape');
    await ui.returned('test', 'dialog-test-confirm');
    assert.equal(await smtpValue(page, 'from-name'), dirtyName);
    report.checks.push(
      'A real save completes before further editing; delayed completion frames preserve the next keyboard action and the dirty-test confirmation.',
    );
  } finally {
    await releaseFrames();
    await transport.dispose();
  }
}
