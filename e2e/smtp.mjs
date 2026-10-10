/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const smtpModule = (name) =>
  new URL(`./smtp-${name}.mjs`, config.identitySessionScript).href;
const [
  { accountSignIn, accountRequest },
  {
    smtpControl,
    smtpReady,
    smtpOpen,
    smtpFill,
    smtpValue,
    smtpConfigure,
    createSmtpPage,
    captureSmtpLayouts,
  },
  { smtpTransport },
  { verifyUnknownSmtp },
  { verifySmtpLifecycle },
  { verifySmtpSaveFocus },
  { resizeViewport, setTheme },
  { installBrowserErrors, readBrowserErrors },
] = await Promise.all([
  import(new URL('./account-auth.mjs', config.identitySessionScript).href),
  import(smtpModule('page')),
  import(smtpModule('transport')),
  import(smtpModule('recovery')),
  import(smtpModule('lifecycle')),
  import(smtpModule('focus')),
  import(new URL('./browser-geometry.mjs', config.identitySessionScript).href),
  import(config.errorsScript),
]);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const fixture = config.smtpFixture;
assert.ok(
  fixture,
  'SMTP suite requires the runner’s isolated real SMTP fixture',
);
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  phase: config.smtpPhase ?? 'all',
  checks: [],
  layouts: [],
  screenshots: [],
  requests: [],
  diagnostics: [],
  limitations: [
    'Local TLS/STARTTLS fixture receives real mail; an external provider and final delivery to a real mailbox remain separate acceptance.',
    'Lost HTTP responses are deliberate transport faults after real requests, not fabricated server results.',
    'Chromium viewport emulation does not verify physical touch, keyboard or safe areas.',
  ],
};
const ui = createSmtpPage(page, config, report);
const request = async (method = 'GET', body) => {
  const result = await accountRequest(
    page,
    report,
    390,
    '/api/settings/smtp',
    method,
    body,
  );
  assert.equal(result.status, 200);
  return result.payload;
};
const state = async () =>
  await (await fetch(`${fixture.control}/state`)).json();
const mailCount = async () =>
  Object.values(await state()).reduce(
    (sum, item) => sum + item.received.length,
    0,
  );
const idle = () =>
  page.waitForSelector(`${smtpControl('page')}[data-operation="idle"]`);
const testResult = (state) =>
  page.waitForSelector(`${smtpControl('test-result')}[data-state="${state}"]`);
const readySave = async () => {
  await page.waitForFunction(
    (selector) => !document.querySelector(selector).disabled,
    smtpControl('save'),
  );
  await ui.activate('save');
  await idle();
};
const acceptedTest = async () => {
  const observed = await smtpTransport(page);
  try {
    await ui.activate('test');
    await observed.settled('POST');
    assert.equal(
      (await observed.observed()).responses.find(
        (response) => response.method === 'POST',
      ).status,
      200,
    );
    await idle();
    await testResult('accepted');
  } finally {
    await observed.dispose();
  }
};
const seeded = async (target, input = {}) => {
  await request('PATCH', {
    ...target,
    username: fixture.username,
    password: fixture.password,
    fromName: 'Ariso 浏览器测试',
    fromEmail: 'sender@example.test',
    ...input,
  });
  await smtpOpen(page, config);
};
let errorScript;
let failure;
try {
  errorScript = await installBrowserErrors(page);
  await accountSignIn(page, config, report, config.credentials, 390);
  await smtpOpen(page, config);
  assert.equal(await request(), null, 'Dedicated SMTP run begins unconfigured');
  assert.equal(
    await smtpValue(page, 'host'),
    '',
    'Unconfigured UI has no demonstration hostname',
  );
  assert.equal(
    await page.evaluate(
      (selector) => document.querySelector(selector).disabled,
      smtpControl('test'),
    ),
    true,
    'Testing is disabled before a real configuration is saved',
  );
  if (!config.smtpPhase || config.smtpPhase === 'representative') {
    report.stage = 'representative-unconfigured';
    const loading = await smtpTransport(page, {
      method: 'GET',
      hold: true,
      read: true,
    });
    try {
      await page.reload();
      await loading.settled('GET');
      await page.waitForSelector(
        `${smtpControl('page')}[data-state="loading"]`,
      );
      for (const width of [1440, 390]) {
        await resizeViewport(page, width);
        await ui.themedGeometry(`loading-${width}`);
      }
      assert.equal(
        await page.evaluate(
          (selector) => !!document.querySelector(selector),
          smtpControl('host'),
        ),
        false,
        'The UI does not display an empty editable form before the real read completes',
      );
      await loading.release();
      await smtpReady(page);
    } finally {
      await loading.dispose();
    }
    await captureSmtpLayouts(page, config, report, ui, { tips: false });
    await seeded(fixture.targets.tls);
    await captureSmtpLayouts(page, config, report, ui, { name: 'configured' });
    for (const width of [1440, 390]) {
      await resizeViewport(page, width);
      for (const theme of ['light', 'dark']) {
        await setTheme(page, theme);
        await ui.geometry(`saved-${theme}-${width}`);
        await ui.activate('clear');
        await page.waitForSelector(smtpControl('dialog-clear'));
        await ui.geometry(`clear-dialog-${theme}-${width}`);
        await page.keyboard.press('Escape');
        await ui.returned('clear', 'dialog-clear');
        await smtpFill(page, 'from-name', '尚未保存的名称');
        await ui.activate('test');
        await page.waitForSelector(smtpControl('dialog-test-confirm'));
        await ui.geometry(`dirty-test-${theme}-${width}`);
        await page.keyboard.press('Escape');
        await ui.returned('test', 'dialog-test-confirm');
        assert.equal(await smtpValue(page, 'from-name'), '尚未保存的名称');
        await smtpFill(page, 'from-name', 'Ariso 浏览器测试');
      }
    }
    for (const theme of ['light', 'dark']) {
      await resizeViewport(page, 390, 400);
      await setTheme(page, theme);
      await smtpFill(page, 'from-name', '短视口未保存输入');
      await page.focus(smtpControl('save'));
      await ui.geometry(`saved-short-${theme}`);
      assert.equal(
        await page.evaluate((selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        }, smtpControl('save')),
        true,
        'Configured short viewport keeps save reachable',
      );
      await smtpFill(page, 'from-name', 'Ariso 浏览器测试');
    }
    assert.equal(
      await mailCount(),
      0,
      'Reading, help and cancelled dialogs send no mail',
    );
  }
  if (
    !config.smtpPhase ||
    config.smtpPhase === 'interactions' ||
    config.smtpPhase === 'focus'
  ) {
    report.stage = 'save-focus';
    for (const width of [1440, 390]) {
      await resizeViewport(page, width);
      await setTheme(page, 'light');
      await seeded(fixture.targets.tls);
      await verifySmtpSaveFocus(page, ui, report);
    }
  }
  if (!config.smtpPhase || config.smtpPhase === 'interactions') {
    report.stage = 'save-and-secrets';
    for (const width of [1440, 390]) {
      await resizeViewport(page, width);
      await setTheme(page, 'light');
      await smtpConfigure(page, fixture.targets.tls, {
        username: fixture.username,
        password: fixture.password,
      });
      await smtpFill(page, 'port', 0);
      const invalid = await smtpTransport(page);
      try {
        await ui.activate('save');
        await page.waitForSelector(
          `${smtpControl('port')}[aria-invalid="true"]`,
        );
        await page.waitForFunction(
          (selector) =>
            document.activeElement === document.querySelector(selector),
          smtpControl('port'),
        );
        assert.equal(
          await smtpValue(page, 'host'),
          fixture.targets.tls.host,
          'Field errors retain the other form values',
        );
        assert.equal(await smtpValue(page, 'username'), fixture.username);
        assert.equal(
          (await invalid.observed()).requests.filter(
            (item) => item.method === 'PATCH',
          ).length,
          0,
          'Invalid port is rejected before sending a write',
        );
        for (const theme of ['light', 'dark']) {
          await setTheme(page, theme);
          await ui.geometry(`port-error-${theme}-${width}`);
        }
        await setTheme(page, 'light');
      } finally {
        await invalid.dispose();
      }
      await smtpFill(page, 'port', fixture.targets.tls.port);
      const beforeCount = await mailCount();
      const transport = await smtpTransport(page, {
        method: 'PATCH',
        hold: true,
      });
      try {
        const source = await ui.sourceState();
        await ui.activate('save');
        const pending = await transport.settled();
        assert.equal(pending.responses.at(-1).status, 200);
        assert.equal(
          await page.evaluate(
            (selector) => document.querySelector(selector).disabled,
            smtpControl('save'),
          ),
          true,
          'Saving prevents duplicate writes',
        );
        await ui.themedGeometry(`saving-${width}`);
        await transport.release();
        await idle();
        assert.deepEqual(
          await ui.sourceState(),
          source,
          'Saving retains the source page and scrolling',
        );
      } finally {
        await transport.dispose();
      }
      const saved = await request();
      assert.equal(saved.hasPassword, true);
      assert.equal(
        Object.hasOwn(saved, 'password'),
        false,
        'GET exposes only password presence',
      );
      assert.equal(
        await smtpValue(page, 'password'),
        '',
        'Saved secret is not echoed',
      );
      assert.equal(
        await mailCount(),
        beforeCount,
        'Saving does not connect or send a test message',
      );
      await smtpFill(page, 'from-name', `保存名称 ${width}`);
      const omission = await smtpTransport(page);
      try {
        await readySave();
        const written = (await omission.settled('PATCH')).requests.find(
          (item) => item.method === 'PATCH',
        );
        assert.equal(
          written.hasPasswordField,
          false,
          'Leaving the secret blank omits it instead of replacing it',
        );
      } finally {
        await omission.dispose();
      }
      assert.equal((await request()).hasPassword, true);
      await smtpFill(page, 'from-name', `连续保存名称 ${width}`);
      await readySave();
      await page.waitForFunction(
        () =>
          document.querySelectorAll(
            '[data-slot="toast"]:not([data-exiting="true"]):not([data-hidden="true"])',
          ).length >= 2,
      );
      await ui.themedGeometry(`stacked-save-notices-${width}`);
      const notices = await page.evaluate(() =>
        [...document.querySelectorAll('[data-slot="toast"]')]
          .filter(
            (node) =>
              node.dataset.exiting !== 'true' && node.dataset.hidden !== 'true',
          )
          .map((node) => ({
            front: node.dataset.frontmost === 'true',
            expanded: node.dataset.expanded === 'true',
            closeVisibility: getComputedStyle(
              node.querySelector('[data-slot="toast-close"]'),
            ).visibility,
          })),
      );
      assert.ok(notices.some((notice) => notice.front));
      for (const notice of notices)
        assert.equal(
          notice.closeVisibility,
          notice.front || notice.expanded ? 'visible' : 'hidden',
          'Collapsed notifications hide their scaled close targets; the front or expanded notification keeps its close available',
        );
      await smtpFill(page, 'password', 'deliberately-wrong-fixture-password');
      const replacement = await smtpTransport(page);
      try {
        await readySave();
        await replacement.settled('PATCH');
        assert.equal(
          (await replacement.observed()).requests.find(
            (item) => item.method === 'PATCH',
          ).hasPasswordField,
          true,
          'A new nonempty secret is explicitly submitted',
        );
        await ui.activate('test');
        await replacement.settled('POST');
        assert.equal(
          (await replacement.observed()).responses.find(
            (item) => item.method === 'POST',
          ).diagnostic.stage,
          'authentication',
          'Real SMTP rejects the replacement secret, proving it took effect',
        );
        await idle();
        await testResult('failed');
        await page.keyboard.press('Escape');
        await page.waitForSelector(
          `${smtpControl('test-result')}[data-state="failed"]`,
          { state: 'hidden' },
        );
      } finally {
        await replacement.dispose();
      }
      await smtpFill(page, 'password', fixture.password);
      const restoreSecret = await smtpTransport(page);
      try {
        await readySave();
        await restoreSecret.settled('PATCH');
      } finally {
        await restoreSecret.dispose();
      }
      await smtpFill(page, 'from-name', '未保存的测试名称');
      await ui.activate('test');
      await page.waitForSelector(smtpControl('dialog-test-confirm'));
      assert.equal(
        await mailCount(),
        beforeCount,
        'Opening the dirty-test confirmation does not send',
      );
      const send = await smtpTransport(page, { method: 'POST', hold: true });
      try {
        await ui.activate('test-confirm');
        await send.settled();
        assert.equal(
          await page.evaluate(
            (selector) => document.querySelector(selector).disabled,
            smtpControl('test'),
          ),
          true,
          'Pending send prevents duplicate testing',
        );
        await ui.themedGeometry(`testing-${width}`);
        await send.release();
        await idle();
        await testResult('accepted');
        await ui.themedGeometry(`accepted-${width}`);
        assert.equal(
          (await send.observed()).requests.filter(
            (item) => item.method === 'POST',
          ).length,
          1,
        );
      } finally {
        await send.dispose();
      }
      const receipt = (await state()).tls.received.at(-1);
      assert.deepEqual(
        receipt.recipients,
        [config.credentials.email],
        'Real SMTP receipt is addressed to the current owner',
      );
      assert.equal(receipt.secure, true);
      assert.equal(
        (await request()).fromName,
        `连续保存名称 ${width}`,
        'Testing does not silently save the dirty form',
      );
      assert.equal(await smtpValue(page, 'from-name'), '未保存的测试名称');
      // Clear the saved credentials while preserving an unrelated unsaved field.
      await smtpFill(page, 'host', 'unsaved.internal');
      await ui.activate('clear');
      await page.waitForSelector(smtpControl('dialog-clear'));
      await page.keyboard.press('Escape');
      await ui.returned('clear', 'dialog-clear');
      assert.equal(
        (await request()).hasPassword,
        true,
        'Cancel performs no credential mutation',
      );
      await ui.activate('clear');
      await page.waitForSelector(smtpControl('dialog-clear'));
      const clear = await smtpTransport(page);
      try {
        const source = await ui.sourceState();
        await ui.activate('clear-confirm');
        await clear.settled('PATCH');
        await page.waitForSelector(smtpControl('dialog-clear'), {
          state: 'hidden',
        });
        await page.waitForFunction(
          (selector) =>
            document.activeElement === document.querySelector(selector),
          smtpControl('save'),
        );
        assert.deepEqual(
          await ui.sourceState(),
          source,
          'Clearing credentials retains the source page and scrolling',
        );
        const written = (await clear.observed()).requests.find(
          (item) => item.method === 'PATCH',
        );
        assert.deepEqual(
          written.fields,
          ['clearCredentials'],
          'Clearing saves only the explicit credential clear',
        );
      } finally {
        await clear.dispose();
      }
      const cleared = await request();
      assert.equal(cleared.host, fixture.targets.tls.host);
      assert.equal(cleared.hasPassword, false);
      assert.equal(cleared.username, '');
      assert.equal(
        await smtpValue(page, 'host'),
        'unsaved.internal',
        'Clearing retains unrelated draft edits',
      );
      assert.equal(
        await page.evaluate(
          (selector) => !!document.querySelector(selector),
          smtpControl('clear'),
        ),
        false,
      );
      await seeded(fixture.targets.starttls);
      const starttlsCount = (await state()).starttls.received.length;
      await acceptedTest();
      assert.equal((await state()).starttls.received.length, starttlsCount + 1);
      assert.equal(
        (await state()).starttls.received.at(-1).secure,
        true,
        'STARTTLS receipt uses a real upgraded connection',
      );
      await seeded(fixture.targets.relay, {
        clearCredentials: true,
        username: undefined,
        password: undefined,
      });
      await acceptedTest();
      assert.deepEqual(
        (await state()).relay.received.at(-1).recipients,
        [config.credentials.email],
        'No-auth relay sends to owner',
      );
      report.checks.push(
        `Desktop/mobile ${width}: separate save/test, omitted secret retained, confirmed clear preserves draft, real TLS/STARTTLS/no-auth receipts.`,
      );
    }
  }
  if (!config.smtpPhase || config.smtpPhase === 'recovery') {
    report.stage = 'read-failure';
    const readFault = await smtpTransport(page, {
      method: 'GET',
      lose: true,
      read: true,
    });
    try {
      await page.reload();
      await readFault.settled();
      await page.waitForSelector(`${smtpControl('page')}[data-state="error"]`);
      await ui.themedGeometry('read-error');
      await ui.activate('reload');
      await smtpReady(page);
    } finally {
      await readFault.dispose();
    }
    for (const width of [1440, 390]) {
      await resizeViewport(page, width);
      for (const [target, expectedStage, delivery] of [
        ['connection', 'connection', 'not-accepted'],
        ['tlsFailure', 'tls', 'not-accepted'],
        ['tls', 'authentication', 'not-accepted'],
        ['delivery', 'delivery', 'not-accepted'],
        ['unknown', 'connection', 'unknown'],
      ]) {
        report.stage = `failure-${target}-${width}`;
        await seeded(
          fixture.targets[target],
          target === 'tls'
            ? { password: 'deliberately-wrong-fixture-password' }
            : target === 'starttls' ||
                target === 'tlsFailure' ||
                target === 'connection'
              ? {}
              : {
                  clearCredentials: true,
                  username: undefined,
                  password: undefined,
                },
        );
        const observed = await smtpTransport(page);
        try {
          await ui.activate('test');
          await observed.settled('POST');
          const result = (await observed.observed()).responses.find(
            (item) => item.method === 'POST',
          );
          assert.ok([502, 504].includes(result.status));
          assert.equal(result.diagnostic.stage, expectedStage);
          assert.equal(result.diagnostic.delivery, delivery);
          await idle();
          await testResult(delivery === 'unknown' ? 'unknown' : 'failed');
          if (delivery === 'unknown')
            assert.equal(
              await page.evaluate(() =>
                document.body.textContent.includes('邮箱'),
              ),
              true,
              'Unknown send directs owner to check their mailbox',
            );
          await ui.themedGeometry(`error-${target}-${width}`);
          assert.equal(
            (await observed.observed()).requests.filter(
              (item) => item.method === 'POST',
            ).length,
            1,
            'Failures never resend automatically',
          );
          report.diagnostics.push({ width, target, ...result });
        } finally {
          await observed.dispose();
        }
      }
      await seeded(fixture.targets.tls);
      await smtpFill(page, 'from-name', `丢失响应后保存 ${width}`);
      const lostSave = await smtpTransport(page, {
        method: 'PATCH',
        lose: true,
      });
      try {
        await ui.activate('save');
        await lostSave.settled();
        await page.waitForFunction(
          () =>
            window.__smtpTransport.requests.some(
              (item) => item.method === 'GET',
            ) || !!document.querySelector('[data-testid="smtp-reload"]'),
        );
        if (
          !(await lostSave.observed()).requests.some(
            (item) => item.method === 'GET',
          )
        )
          await ui.activate('reload');
        await lostSave.settled('GET');
        await page.waitForSelector(
          `${smtpControl('pending')}[data-state="matched"]`,
        );
        assert.equal((await request()).fromName, `丢失响应后保存 ${width}`);
        assert.equal(
          (await lostSave.observed()).requests.filter(
            (item) => item.method === 'PATCH',
          ).length,
          1,
        );
        await ui.themedGeometry(`save-readback-${width}`);
        await ui.activate('resume-current');
        await page.waitForSelector(smtpControl('pending'), { state: 'hidden' });
        await idle();
      } finally {
        await lostSave.dispose();
      }
      await smtpFill(page, 'host', 'draft.internal');
      await ui.activate('clear');
      await page.waitForSelector(smtpControl('dialog-clear'));
      const lostClear = await smtpTransport(page, {
        method: 'PATCH',
        lose: true,
      });
      try {
        await ui.activate('clear-confirm');
        await lostClear.settled('GET');
        await page.waitForSelector(
          `${smtpControl('pending')}[data-state="clear-matched"]`,
        );
        await page.waitForSelector(smtpControl('dialog-clear'), {
          state: 'hidden',
        });
        assert.equal(
          (await request()).hasPassword,
          false,
          'Unknown clear reads back the real cleared credentials',
        );
        assert.equal(
          await smtpValue(page, 'host'),
          'draft.internal',
          'Clear readback retains unrelated unsaved input',
        );
        assert.equal(
          (await lostClear.observed()).requests.filter(
            (item) => item.method === 'PATCH',
          ).length,
          1,
          'Unknown clear never blindly repeats PATCH',
        );
        await ui.themedGeometry(`clear-readback-${width}`);
        await ui.activate('resume-current');
        await page.waitForSelector(smtpControl('pending'), { state: 'hidden' });
        await idle();
      } finally {
        await lostClear.dispose();
      }
      await seeded(fixture.targets.tls);
      const lostSend = await smtpTransport(page, {
        method: 'POST',
        lose: true,
      });
      const beforeCount = await mailCount();
      try {
        await ui.activate('test');
        await lostSend.settled();
        await idle();
        await testResult('unknown');
        assert.equal(
          await mailCount(),
          beforeCount + 1,
          'SMTP really receives mail before the browser loses acceptance response',
        );
        await ui.themedGeometry(`send-response-unknown-${width}`);
        assert.equal(
          (await lostSend.observed()).requests.filter(
            (item) => item.method === 'POST',
          ).length,
          1,
        );
      } finally {
        await lostSend.dispose();
      }
      report.stage = `unknown-save-recovery-${width}`;
      await verifyUnknownSmtp(page, {
        width,
        fixture,
        report,
        ui,
        request,
        seeded,
        idle,
        readySave,
        acceptedTest,
      });
      report.stage = `session-lifecycle-${width}`;
      await verifySmtpLifecycle(page, {
        config,
        width,
        fixture,
        report,
        ui,
        seeded,
      });
      report.checks.push(
        `${width}: real SMTP connection/TLS/authentication/delivery/unknown diagnostics, read recovery, saved-result readback and accepted-mail HTTP loss.`,
      );
    }
  }
  report.browserErrors = await readBrowserErrors(page);
  assert.deepEqual(
    report.browserErrors,
    [],
    'SMTP produces no browser runtime/resource errors',
  );
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = String(error.stack ?? error)
    .replaceAll(config.credentials.password, '[redacted]')
    .replaceAll(fixture.password, '[redacted]');
  await ui.screenshot('failure');
} finally {
  if (errorScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errorScript,
    });
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(config.output, 'smtp.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw new Error(report.error);
console.log({ smtp: report.status, report: join(config.output, 'smtp.json') });
