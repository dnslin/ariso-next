import assert from 'node:assert/strict';
import { resizeViewport, setTheme } from './browser-geometry.mjs';
import { identitySql } from './identity-session.mjs';
import {
  createTokensPage,
  createDialog,
  revokeDialog,
  tokenControl,
  tokenSelector,
  tokensRequest,
  displayedTokenTime,
} from './tokens-page.mjs';
import { tokensReadFault, tokensWriteFault } from './tokens-transport.mjs';

async function checkedRead(page, ui, dialog, action, name, width) {
  const fault = await tokensReadFault(page, true, false);
  try {
    await page.click(tokenControl(action));
    await page.waitForSelector(`${dialog}[data-state="checking"]`);
    assert.equal(
      (await fault.result()).status,
      200,
      'The checking state holds a real list response',
    );
    assert.equal(
      await page.evaluate(
        (selector) =>
          [
            ...document.querySelector(selector).querySelectorAll('button'),
          ].every((node) => node.disabled),
        dialog,
      ),
      true,
      'Reconciliation disables every modal action',
    );
    await ui.stateGeometry(`${name}-checking`, width);
    await fault.release();
    await page.waitForSelector(`${dialog}[data-state="checked"]`);
  } finally {
    await fault.dispose();
  }
}

export async function verifyTokenExitRecovery(
  page,
  config,
  report,
  registerSecret,
) {
  const ui = createTokensPage(page, config, report);
  for (const width of config.width ? [config.width] : [1440, 390]) {
    await resizeViewport(page, width);
    const created = await tokensRequest(page, report, width, 'POST', {
      name: `退出未知后的核对-${width}`,
    });
    assert.equal(created.status, 200);
    registerSecret(created.payload.key);
    const id = created.payload.token.id;
    await page.reload();
    await ui.rowState(id, 'enabled');
    for (const kind of [
      'disable-escape',
      'enable-return-failed',
      'revoke-escape',
    ]) {
      const deleting = kind === 'revoke-escape';
      const failedReturn = kind === 'enable-return-failed';
      const write = await tokensWriteFault(
        page,
        `/api/upload-tokens/${id}`,
        deleting ? 'DELETE' : 'PATCH',
        { lose: true, reconcile: failedReturn ? 'fail' : undefined },
      );
      try {
        if (deleting) {
          await ui.openRevoke(id);
          await page.click(tokenControl('revoke-confirm'));
        } else
          await page.click(`${tokenSelector(id)} ${tokenControl('toggle')}`);
        const actual = await write.result();
        assert.equal(actual.status, 200);
        if (!deleting) assert.equal(actual.tokenEnabled, failedReturn);
        await write.release();
        await page.waitForSelector(`${revokeDialog}[data-state="unknown"]`);
        if (failedReturn) {
          await page.click(tokenControl('check-action'));
          await page.waitForSelector(
            `${revokeDialog}[data-state="check-failed"]`,
          );
        }
        assert.equal((await write.result()).requests, 1);
        report.business.push({
          scenario: kind,
          width,
          id,
          actualWriteStatus: 200,
          writtenEnabled: actual.tokenEnabled,
          expectedEnabled: deleting ? null : failedReturn,
          uiMutations: 1,
        });
      } finally {
        await write.dispose();
      }
      const read = await tokensReadFault(page, !failedReturn, false);
      try {
        if (failedReturn) await page.click(tokenControl('revoke-cancel'));
        else {
          await page.waitForFunction((selector) => {
            const dialog = document.querySelector(selector);
            const backdrop = dialog?.closest(
              '[data-slot="alert-dialog-backdrop"]',
            );
            return (
              dialog?.contains(document.activeElement) &&
              !backdrop?.hasAttribute('data-entering')
            );
          }, revokeDialog);
          await page.keyboard.press('Escape');
        }
        await page.waitForSelector(revokeDialog, { state: 'hidden' });
        await page.waitForSelector(
          `[data-testid="api-page"][data-state="${failedReturn ? 'error' : 'loading'}"]`,
        );
        assert.equal(
          (await read.result()).status,
          200,
          'Leaving an unresolved dialog reads the actual list',
        );
        assert.equal(
          await page.evaluate(
            () =>
              document.querySelector('[data-testid="api-create-open"]')
                .disabled,
          ),
          true,
          'Actions remain disabled until the real list is read',
        );
        assert.equal(
          await page.evaluate(() =>
            document.querySelector('[data-testid="api-list"]'),
          ),
          null,
          'Unresolved exit cannot restore a stale interactive list',
        );
        if (!failedReturn) await read.release();
      } finally {
        await read.dispose();
      }
      if (failedReturn) {
        await page.waitForSelector(
          '[data-testid="api-page"][data-state="error"]',
        );
        assert.equal(
          await page.evaluate(
            () =>
              document.querySelector('[data-testid="api-create-open"]')
                .disabled,
          ),
          true,
          'Failed exit reconciliation keeps management unavailable',
        );
        assert.equal(
          await page.evaluate(() =>
            document.querySelector('[data-testid="api-list"]'),
          ),
          null,
        );
        await page.waitForFunction(
          () =>
            document.activeElement ===
            document.querySelector('[data-testid="api-load-retry"]'),
        );
        await ui.stateGeometry('unknown-exit-read-error', width);
        await page.click(tokenControl('load-retry'));
      }
      await page.waitForSelector(
        '[data-testid="api-page"][data-state="ready"]',
      );
      if (deleting)
        await page.waitForSelector(tokenSelector(id), { state: 'hidden' });
      else await ui.rowState(id, failedReturn ? 'enabled' : 'disabled');
      await page.waitForFunction(
        () =>
          document.activeElement ===
          document.querySelector('[data-testid="api-create-open"]'),
      );
    }

    await ui.openCreate(`创建未知直接返回-${width}`);
    const write = await tokensWriteFault(page, '/api/upload-tokens', 'POST', {
      lose: true,
    });
    let lostId;
    try {
      await page.click(tokenControl('create-submit'));
      const result = await write.result();
      assert.equal(result.status, 200);
      lostId = result.tokenId;
      await write.release();
      await page.waitForSelector(`${createDialog}[data-state="unknown"]`);
    } finally {
      await write.dispose();
    }
    const read = await tokensReadFault(page, true, false);
    try {
      await page.click(tokenControl('check-back'));
      await page.waitForSelector(createDialog, { state: 'hidden' });
      await page.waitForSelector(
        '[data-testid="api-page"][data-state="loading"]',
      );
      assert.equal((await read.result()).status, 200);
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('[data-testid="api-create-open"]').disabled,
        ),
        true,
      );
      await read.release();
    } finally {
      await read.dispose();
    }
    await page.waitForSelector(tokenSelector(lostId));
    await page.waitForFunction(
      () =>
        document.activeElement ===
        document.querySelector('[data-testid="api-create-open"]'),
    );
    assert.equal(
      await page.evaluate(() =>
        document.querySelector('[data-testid="api-secret"]'),
      ),
      null,
    );
    report.business.push({
      scenario: 'create-unknown-return',
      width,
      id: lostId,
      fullValueUnavailable: true,
    });
  }
  report.checks.push(
    'Esc or direct return from unknown/check-failed creation or mutation states first refreshes the real list; pending/failed refresh hides stale actions; failed reads focus retry and successful reads focus create while restoring current enabled/disabled/missing records.',
  );
}

export async function verifyTokenUnknownEntry(
  page,
  config,
  report,
  registerSecret,
) {
  const ui = createTokensPage(page, config, report);
  for (const width of config.width ? [config.width] : [1440, 390]) {
    await resizeViewport(page, width);
    await setTheme(page, 'light');
    const name = `同名旧记录-${width}`;
    const old = await tokensRequest(page, report, width, 'POST', { name });
    assert.equal(old.status, 200);
    registerSecret(old.payload.key);
    await page.reload();
    await page.waitForSelector(tokenSelector(old.payload.token.id));
    for (const result of ['one', 'none', 'many']) {
      const beforeIds = (
        await tokensRequest(page, report, width)
      ).payload.tokens.map(({ id }) => id);
      const snapshot = await ui.openCreate(name);
      const fault = await tokensWriteFault(page, '/api/upload-tokens', 'POST', {
        lose: true,
        sent: result !== 'none',
        reconcile: result === 'one' ? 'fail' : undefined,
      });
      let createdId;
      try {
        await page.click(tokenControl('create-submit'));
        const actual = await fault.result();
        if (result !== 'none') {
          assert.equal(
            actual.status,
            200,
            'Lost create responses follow a real committed write',
          );
          createdId = actual.tokenId;
          assert.ok(createdId && !beforeIds.includes(createdId));
        }
        await fault.release();
        await page.waitForSelector(`${createDialog}[data-state="unknown"]`);
        assert.equal(
          await page.evaluate(() =>
            document.querySelector('[data-testid="api-secret"]'),
          ),
          null,
          'A lost create response cannot reconstruct the full key',
        );
        assert.equal(
          await page.evaluate(() =>
            document.querySelector('[data-testid="api-create-submit"]'),
          ),
          null,
          'Unknown create has no blind retry',
        );
        assert.equal(
          (await fault.result()).requests,
          1,
          'The UI never automatically repeats its create',
        );
        if (result === 'one') {
          await ui.stateGeometry('create-unknown', width);
          await page.click(tokenControl('check-create'));
          await page.waitForSelector(
            `${createDialog}[data-state="check-failed"]`,
          );
          assert.equal(
            (await fault.result()).requests,
            1,
            'A failed read does not retry create',
          );
          await ui.stateGeometry('create-check-failed', width);
        }
      } finally {
        await fault.dispose();
      }
      let concurrentId;
      if (result === 'many') {
        const concurrent = await tokensRequest(page, report, width, 'POST', {
          name,
        });
        assert.equal(concurrent.status, 200);
        registerSecret(concurrent.payload.key);
        concurrentId = concurrent.payload.token.id;
      }
      await checkedRead(
        page,
        ui,
        createDialog,
        'check-create',
        `create-${result}`,
        width,
      );
      await page.waitForSelector(`${createDialog}[data-result="${result}"]`);
      const candidates = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="api-candidate"]')].map(
          (node) => ({ id: node.dataset.tokenId, text: node.textContent }),
        ),
      );
      assert.deepEqual(
        candidates.map(({ id }) => id).sort(),
        [createdId, concurrentId].filter(Boolean).sort(),
        'Candidates come only from IDs absent before submit, never from same-name old records',
      );
      const listed = (await tokensRequest(page, report, width)).payload.tokens;
      for (const candidate of candidates) {
        const token = listed.find(({ id }) => id === candidate.id);
        assert.ok(
          token &&
            candidate.text.includes(token.id) &&
            candidate.text.includes(name),
          'Each candidate shows its actual ID and name',
        );
        assert.ok(
          candidate.text.includes(
            displayedTokenTime(token.createdAt, config.tokensTimeZone),
          ),
          'Candidate creation time follows the configured site timezone',
        );
        assert.ok(
          candidate.text.includes(
            token.expiresAt
              ? displayedTokenTime(token.expiresAt, config.tokensTimeZone)
              : '永不过期',
          ),
        );
        assert.ok(candidate.text.includes(token.enabled ? '已启用' : '已停用'));
      }
      assert.equal(
        await page.evaluate(() =>
          document.querySelector('[data-testid="api-create-submit"]'),
        ),
        null,
        'A checked result still cannot blindly repeat create',
      );
      if (result === 'none')
        assert.equal(
          await page.evaluate(
            (selector) =>
              document
                .querySelector(selector)
                .textContent.includes('本次未创建'),
            createDialog,
          ),
          false,
          'No candidate does not prove that the request never created a key',
        );
      await ui.stateGeometry(`create-checked-${result}`, width);
      await page.focus(tokenControl('check-return'));
      await page.keyboard.press('Enter');
      await ui.returnFocus(tokenControl('create-open'), snapshot);
      report.business.push({
        scenario: `create-reconcile-${result}`,
        width,
        previousIds: beforeIds,
        candidateIds: candidates.map(({ id }) => id),
        uiPosts: 1,
        requestSent: result !== 'none',
        concurrentFixtureId: concurrentId,
        fullValueUnavailable: true,
      });
    }
    await identitySql(
      config,
      "CREATE TRIGGER reject_browser_token_create BEFORE INSERT ON apikey BEGIN SELECT RAISE(ABORT, 'browser token insertion failure'); END",
    );
    try {
      await ui.openCreate(`写入错误-${width}`);
      const failed = await tokensWriteFault(page, '/api/upload-tokens', 'POST');
      try {
        await page.click(tokenControl('create-submit'));
        assert.equal(
          (await failed.result()).status,
          500,
          'Database rejection is an actual HTTP failure',
        );
        await failed.release();
        await page.waitForSelector(`${createDialog}[data-state="unknown"]`);
        assert.equal((await failed.result()).requests, 1);
        assert.equal(
          await page.evaluate(() =>
            document.querySelector('[data-testid="api-secret"]'),
          ),
          null,
        );
        await ui.stateGeometry('create-server-error', width);
      } finally {
        await failed.dispose();
      }
    } finally {
      await identitySql(config, 'DROP TRIGGER reject_browser_token_create');
    }
    await page.reload();
    await page.waitForSelector('[data-testid="api-page"][data-state="ready"]');
  }
  report.checks.push(
    'Real lost create responses and real server errors keep the result unresolved without repeating POST; held/failed read recovery and none/one/many outcomes use the pre-submit ID set; old same-name rows are never candidates and full values cannot be recovered.',
  );
}

export async function verifyTokenActionRecovery(
  page,
  config,
  report,
  registerSecret,
) {
  const ui = createTokensPage(page, config, report);
  for (const width of config.width ? [config.width] : [1440, 390]) {
    await resizeViewport(page, width);
    const created = await tokensRequest(page, report, width, 'POST', {
      name: `未知操作-${width}`,
    });
    assert.equal(created.status, 200);
    registerSecret(created.payload.key);
    const id = created.payload.token.id;
    await page.reload();
    await ui.rowState(id, 'enabled');
    for (const kind of ['disable', 'revoke-not-sent', 'enable', 'revoke']) {
      const method = kind.startsWith('revoke') ? 'DELETE' : 'PATCH';
      const fault = await tokensWriteFault(
        page,
        `/api/upload-tokens/${id}`,
        method,
        {
          lose: true,
          sent: kind !== 'revoke-not-sent',
          reconcile: kind === 'disable' ? 'fail' : undefined,
        },
      );
      try {
        if (method === 'PATCH')
          await page.click(`${tokenSelector(id)} ${tokenControl('toggle')}`);
        else {
          await ui.openRevoke(id);
          await page.click(tokenControl('revoke-confirm'));
        }
        const actual = await fault.result();
        if (kind !== 'revoke-not-sent') assert.equal(actual.status, 200);
        await fault.release();
        await page.waitForSelector(`${revokeDialog}[data-state="unknown"]`);
        assert.equal(
          await page.evaluate(() =>
            document.querySelector('[data-testid="api-revoke-confirm"]'),
          ),
          null,
          'Unknown action cannot repeat a destructive request',
        );
        assert.equal((await fault.result()).requests, 1);
        await ui.stateGeometry(`${kind}-unknown`, width);
        if (kind === 'disable') {
          await page.click(tokenControl('check-action'));
          await page.waitForSelector(
            `${revokeDialog}[data-state="check-failed"]`,
          );
          await ui.stateGeometry('action-check-failed', width);
        }
      } finally {
        await fault.dispose();
      }
      await checkedRead(page, ui, revokeDialog, 'check-action', kind, width);
      const missing = kind === 'revoke';
      await page.waitForSelector(
        `${revokeDialog}[data-result="${missing ? 'missing' : 'present'}"]`,
      );
      if (!missing) {
        const current = await page.evaluate(
          () =>
            document.querySelector('[data-testid="api-current-token"]')
              .textContent,
        );
        assert.ok(current.includes(id));
        assert.ok(current.includes(kind === 'enable' ? '已启用' : '已停用'));
        if (kind === 'revoke-not-sent')
          assert.equal(
            current.includes('仍可使用'),
            false,
            'Failed revoke does not describe a disabled credential as usable',
          );
      }
      const listed = (
        await tokensRequest(page, report, width)
      ).payload.tokens.find((token) => token.id === id);
      assert.equal(
        !!listed,
        !missing,
        'Checked state follows the actual target ID',
      );
      if (listed) assert.equal(listed.enabled, kind === 'enable');
      assert.equal(
        await page.evaluate(() =>
          document.querySelector('[data-testid="api-revoke-confirm"]'),
        ),
        null,
        'Checked recovery presents current data without submitting again',
      );
      await ui.stateGeometry(`${kind}-checked`, width);
      await page.click(tokenControl('action-return'));
      await page.waitForSelector(revokeDialog, { state: 'hidden' });
      if (missing)
        await page.waitForFunction(
          () =>
            document.activeElement ===
            document.querySelector('[data-testid="api-create-open"]'),
        );
      report.business.push({
        scenario: `${kind}-reconcile`,
        width,
        id,
        current: missing ? 'missing' : listed.enabled ? 'enabled' : 'disabled',
        uiMutations: 1,
        requestSent: kind !== 'revoke-not-sent',
      });
    }
  }
  report.checks.push(
    'Lost real PATCH/DELETE responses and a request rejected before send do not repeat the action; failed/held reads recover to actual enabled, disabled or missing current state by target ID, with no inferred cause.',
  );
}
