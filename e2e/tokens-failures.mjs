import assert from 'node:assert/strict';
import { resizeViewport } from './browser-geometry.mjs';
import {
  createTokensPage,
  createDialog,
  revokeDialog,
  tokenControl,
  tokenSelector,
  tokensRequest,
} from './tokens-page.mjs';
import { tokensReadFault, tokensWriteFault } from './tokens-transport.mjs';

async function assertFailedDialog(page, selector, title, retry, cancel, error) {
  await page.waitForSelector(`${selector}[data-state="failed"]`);
  const state = await page.evaluate(
    ({ selector, retry, cancel }) => {
      const root = document.querySelector(selector);
      const button = (name) => {
        const node = root.querySelector(`[data-testid="api-${name}"]`);
        return (
          node && {
            text: node.textContent.trim(),
            disabled: node.disabled,
            height: node.getBoundingClientRect().height,
          }
        );
      };
      return {
        title: root.querySelector('[data-slot$="-heading"]').textContent.trim(),
        body: root.querySelector('[data-slot$="-body"]').textContent.trim(),
        forms: root.querySelectorAll('form').length,
        fields: root.querySelectorAll(
          'input,textarea,select,[contenteditable="true"],[role="textbox"],[role="spinbutton"]',
        ).length,
        retry: button(retry),
        cancel: button(cancel),
        checking: !!root.querySelector(
          '[data-testid="api-check-action"],[data-testid="api-check-create"]',
        ),
        secret: !!root.querySelector('[data-testid="api-secret"]'),
      };
    },
    { selector, retry, cancel },
  );
  assert.equal(state.title, title);
  assert.ok(state.body.includes(error.message));
  assert.ok(state.body.includes(`HTTP ${error.status} / ${error.code}`));
  assert.equal(state.forms, 0, 'A known failure uses its short modal');
  assert.equal(state.fields, 0, 'A known failure has no hidden editable form');
  assert.deepEqual(state.retry, { text: '重试', disabled: false, height: 48 });
  assert.deepEqual(state.cancel, { text: '取消', disabled: false, height: 48 });
  assert.equal(
    state.checking,
    false,
    'Known rejection is distinct from unknown recovery',
  );
  assert.equal(
    state.secret,
    false,
    'Rejected operations do not expose a secret',
  );
}

async function verifyCreateFailures(page, ui, report, width, registerSecret) {
  for (const outcome of ['retry', 'cancel', 'expired']) {
    const expires = outcome === 'expired';
    const beforeIds = (
      await tokensRequest(page, report, width)
    ).payload.tokens.map(({ id }) => id);
    const name = `明确创建失败-${outcome}-${width}`;
    const snapshot = await ui.openCreate(name);
    const expiry = expires
      ? new Date(Math.floor((Date.now() + 30_000) / 1000) * 1000)
      : undefined;
    const entered = expiry ? await ui.expiry(expiry) : undefined;
    const fault = await tokensWriteFault(page, '/api/upload-tokens', 'POST', {
      invalidJsonOnce: true,
    });
    try {
      await page.click(tokenControl('create-submit'));
      const actual = await fault.result();
      assert.equal(
        actual.status,
        400,
        'Malformed JSON reaches the real HTTP handler',
      );
      assert.equal(actual.code, 'INVALID_UPLOAD_TOKEN_INPUT');
      assert.deepEqual(
        actual.fields ?? [],
        [],
        'This actual 400 has no field errors',
      );
      await fault.release();
      await assertFailedDialog(
        page,
        createDialog,
        '创建失败',
        'create-retry',
        'create-cancel',
        actual,
      );
      assert.equal(
        (await fault.result()).requests,
        1,
        'Known rejection does not automatically repeat POST',
      );
      const rejectedIds = (
        await tokensRequest(page, report, width)
      ).payload.tokens.map(({ id }) => id);
      assert.deepEqual(
        rejectedIds.filter((id) => !beforeIds.includes(id)),
        [],
        'The actual 400 creates no new ID; existing expired records may be cleaned up',
      );
      await ui.stateGeometry(
        expires ? 'create-known-failure-expiring' : 'create-known-failure',
        width,
      );
      if (outcome === 'cancel') {
        await page.focus(tokenControl('create-cancel'));
        await page.keyboard.press('Enter');
        await ui.returnFocus(tokenControl('create-open'), snapshot);
        assert.equal(
          (await fault.result()).requests,
          1,
          'Cancelling a known rejection sends no additional POST',
        );
        assert.equal(
          await page.evaluate(() =>
            document.querySelector('[data-testid="api-secret"]'),
          ),
          null,
        );
      } else if (expires) {
        await page.waitForFunction(
          (deadline) => Date.now() >= deadline,
          expiry.getTime(),
          { timeout: 35_000 },
        );
        await page.focus(tokenControl('create-retry'));
        await page.keyboard.press('Enter');
        await page.waitForSelector(`${createDialog}[data-state="editing"]`);
        await page.waitForFunction(
          () =>
            document.activeElement ===
            document.querySelector(
              '[data-testid="api-expiry-input"] [data-segment-type="year"]',
            ),
        );
        const restored = await page.evaluate(() => ({
          name: document.querySelector('[data-testid="api-name"]').value,
          expiry: Object.fromEntries(
            [
              ...document.querySelectorAll(
                '[data-testid="api-expiry-input"] [data-segment-type]',
              ),
            ].map((node) => [node.dataset.segmentType, node.textContent]),
          ),
          error: document.querySelector(
            '[data-testid="api-expiry"] [data-slot="field-error"]',
          )?.textContent,
        }));
        assert.equal(restored.name, name);
        assert.deepEqual(
          restored.expiry,
          entered,
          'The failed finite form retains the exact original date segments',
        );
        assert.equal(restored.error, '到期时间须晚于当前时间至少 1 秒');
        assert.equal(
          (await fault.result()).requests,
          1,
          'An expired retry returns to editing without a second POST',
        );
        assert.deepEqual(
          (await tokensRequest(page, report, width)).payload.tokens
            .map(({ id }) => id)
            .filter((id) => !beforeIds.includes(id)),
          [],
          'Local expiry rejection creates no new ID while allowing normal cleanup of older expired records',
        );
        await ui.stateGeometry('create-failed-expired-retry', width);
        await page.focus(tokenControl('secret-close'));
        await page.keyboard.press('Enter');
        await ui.returnFocus(tokenControl('create-open'), snapshot);
      } else {
        await page.focus(tokenControl('create-retry'));
        await page.keyboard.press('Enter');
        const key = await ui.secret();
        registerSecret(key);
        const retried = await fault.result();
        assert.equal(
          retried.requests,
          2,
          'Exactly one explicit retry sends the second POST',
        );
        assert.deepEqual(
          retried.responses.map(({ status }) => status),
          [400, 200],
        );
        const added = (
          await tokensRequest(page, report, width)
        ).payload.tokens.filter(({ id }) => !beforeIds.includes(id));
        assert.equal(added.length, 1);
        assert.equal(added[0].name, name, 'Retry submits the original name');
        assert.equal(
          added[0].expiresAt,
          null,
          'Retry retains the original unlimited duration',
        );
        await ui.closeSecret(snapshot);
      }
      report.business.push({
        scenario: `known-create-failure-${outcome}`,
        width,
        actualStatus: 400,
        errorCode: actual.code,
        noRecordOnRejection: true,
        posts: outcome === 'retry' ? 2 : 1,
      });
    } finally {
      await fault.dispose();
    }
  }
}

async function verifyActionFailures(page, ui, report, width, registerSecret) {
  for (const kind of ['disable', 'enable', 'revoke']) {
    const name = `同名明确操作失败-${kind}-${width}`;
    const created = await tokensRequest(page, report, width, 'POST', { name });
    const sibling = await tokensRequest(page, report, width, 'POST', { name });
    assert.equal(created.status, 200);
    assert.equal(sibling.status, 200);
    registerSecret(created.payload.key, sibling.payload.key);
    const id = created.payload.token.id;
    if (kind === 'enable')
      assert.equal(
        (
          await tokensRequest(
            page,
            report,
            width,
            'PATCH',
            { enabled: false },
            id,
          )
        ).status,
        200,
      );
    await page.reload();
    await ui.rowState(id, kind === 'enable' ? 'disabled' : 'enabled');
    // Remove only the target after UI read. This is a real stale-record race;
    // the same-name sibling remains available to catch target substitution.
    assert.equal(
      (await tokensRequest(page, report, width, 'DELETE', undefined, id))
        .status,
      200,
    );
    const method = kind === 'revoke' ? 'DELETE' : 'PATCH';
    const fault = await tokensWriteFault(
      page,
      `/api/upload-tokens/${id}`,
      method,
    );
    let rejection;
    try {
      if (kind === 'revoke') {
        await ui.openRevoke(id);
        await page.click(tokenControl('revoke-confirm'));
      } else await page.click(`${tokenSelector(id)} ${tokenControl('toggle')}`);
      rejection = await fault.result();
      assert.equal(
        rejection.status,
        404,
        'A real removed target rejects the HTTP operation',
      );
      assert.equal(rejection.code, 'KEY_NOT_FOUND');
      await fault.release();
      const operation =
        kind === 'revoke' ? '撤销' : kind === 'enable' ? '启用' : '停用';
      await assertFailedDialog(
        page,
        revokeDialog,
        `${operation}失败`,
        'action-retry',
        'revoke-cancel',
        rejection,
      );
      assert.equal(
        (await fault.result()).requests,
        1,
        'The UI does not automatically retry a rejected action',
      );
      assert.equal(
        await page.evaluate(
          (selector) =>
            document.querySelector(selector).textContent.includes('仍可使用'),
          revokeDialog,
        ),
        false,
        'Failed operations do not infer that the missing credential remains usable',
      );
      await ui.stateGeometry(`${kind}-known-failure`, width);
      await page.focus(tokenControl('action-retry'));
      await page.keyboard.press('Enter');
      await page.waitForFunction(
        () => window.__tokensFault.observed.responses.length === 2,
      );
      await assertFailedDialog(
        page,
        revokeDialog,
        `${operation}失败`,
        'action-retry',
        'revoke-cancel',
        rejection,
      );
      const retried = await fault.result();
      assert.equal(retried.requests, 2);
      assert.deepEqual(
        retried.responses.map(({ status }) => status),
        [404, 404],
      );
      assert.deepEqual(
        retried.calls,
        [
          { path: `/api/upload-tokens/${id}`, method },
          { path: `/api/upload-tokens/${id}`, method },
        ],
        'Explicit retries retain the original target ID and operation',
      );
    } finally {
      await fault.dispose();
    }
    const read = await tokensReadFault(page, true, false);
    try {
      await page.click(tokenControl('revoke-cancel'));
      await page.waitForSelector(revokeDialog, { state: 'hidden' });
      await page.waitForSelector(
        '[data-testid="api-page"][data-state="loading"]',
      );
      assert.equal(
        (await read.result()).status,
        200,
        'Leaving a known failure reads the actual list',
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('[data-testid="api-create-open"]').disabled,
        ),
        true,
      );
      assert.equal(
        await page.evaluate(() =>
          document.querySelector('[data-testid="api-list"]'),
        ),
        null,
        'A known failure cannot restore stale interactive actions',
      );
      await read.release();
    } finally {
      await read.dispose();
    }
    await page.waitForSelector('[data-testid="api-page"][data-state="ready"]');
    await page.waitForSelector(tokenSelector(id), { state: 'hidden' });
    await ui.rowState(sibling.payload.token.id, 'enabled');
    await page.waitForFunction(
      () =>
        document.activeElement ===
        document.querySelector('[data-testid="api-create-open"]'),
    );
    const actual = (await tokensRequest(page, report, width)).payload.tokens;
    assert.equal(
      actual.some((token) => token.id === id),
      false,
    );
    assert.equal(
      actual.find((token) => token.id === sibling.payload.token.id)?.enabled,
      true,
      'The same-name surviving token is never mutated by failed retry',
    );
    report.business.push({
      scenario: `${kind}-known-failure`,
      width,
      targetId: id,
      sameNameSurvivorId: sibling.payload.token.id,
      actualStatuses: [404, 404],
      errorCode: rejection.code,
      explicitRetry: true,
      exitReadsActualList: true,
    });
  }
}

export async function verifyTokenKnownFailures(
  page,
  config,
  report,
  registerSecret,
) {
  const ui = createTokensPage(page, config, report);
  for (const width of config.width ? [config.width] : [1440, 390]) {
    await resizeViewport(page, width);
    await verifyCreateFailures(page, ui, report, width, registerSecret);
    await verifyActionFailures(page, ui, report, width, registerSecret);
  }
  report.checks.push(
    'Real fieldless HTTP 400 creation rejection shows the approved short failed modal and creates no row; explicit retry retains inputs, while an elapsed finite expiry returns to its editable field and focus without another POST. Actual removed-ID PATCH/DELETE 404 failures retry only on explicit input, never target same-name rows, and refresh the real list before actions return.',
  );
}
