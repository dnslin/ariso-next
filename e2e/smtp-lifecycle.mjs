import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { accountRequest, accountSignIn } from './account-auth.mjs';
import { observeAccountLogin } from './account-transport.mjs';
import {
  smtpControl,
  smtpFill,
  smtpOpen,
  smtpReady,
  smtpValue,
} from './smtp-page.mjs';
import { smtpTransport } from './smtp-transport.mjs';

export async function verifySmtpLifecycle(
  page,
  { config, width, fixture, report, ui, seeded },
) {
  const signedOut = async () => {
    const result = await accountRequest(
      page,
      report,
      width,
      '/api/auth/sign-out',
      'POST',
      {},
    );
    assert.equal(
      result.status,
      200,
      'Actual sign-out invalidates the current Cookie session',
    );
    const session = await accountRequest(
      page,
      report,
      width,
      '/api/auth/get-session',
    );
    assert.equal(
      session.payload,
      null,
      'The server confirms there is no owner session',
    );
  };
  const expired = async () => {
    await page.waitForSelector(`${smtpControl('page')}[data-state="session"]`);
    await page.waitForFunction(
      () =>
        !document.querySelector(
          '[data-testid="smtp-password"],[data-testid="smtp-pending"],[data-testid="smtp-test-result"]',
        ),
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        passwordInput: !!document.querySelector(
          '[data-testid="smtp-password"]',
        ),
        pending: !!document.querySelector('[data-testid="smtp-pending"]'),
        result: !!document.querySelector('[data-testid="smtp-test-result"]'),
        operation: document.querySelector('[data-testid="smtp-page"]').dataset
          .operation,
        saveDisabled: document.querySelector('[data-testid="smtp-save"]')
          .disabled,
        testDisabled: document.querySelector('[data-testid="smtp-test"]')
          .disabled,
      })),
      {
        passwordInput: false,
        pending: false,
        result: false,
        operation: 'idle',
        saveDisabled: true,
        testDisabled: true,
      },
      'Expired SMTP state clears secret controls and recovery dialogs and disables actions',
    );
  };
  const noLateFeedback = async () =>
    assert.equal(
      await page.evaluate(() => {
        const titles = [
          ...document.querySelectorAll('[data-slot="toast-title"]'),
        ].map((node) => node.textContent);
        return (
          !!document.querySelector(
            '[data-testid="smtp-test-result"][data-state="accepted"]',
          ) ||
          titles.some(
            (title) =>
              title === '邮件设置已保存' || title === 'SMTP 用户名和密码已清除',
          )
        );
      }),
      false,
      'A stale SMTP completion cannot create success feedback',
    );
  const signBackIn = async () => {
    await accountSignIn(page, config, report, config.credentials, width);
    await smtpOpen(page, config);
  };
  const recoverThroughLink = async () => {
    await page.click('loc=role:link[name="重新登录"]');
    await page.waitForSelector('#password');
    const login = new URL(await page.url());
    assert.equal(login.pathname, '/login');
    assert.equal(login.searchParams.get('reason'), 'expired');
    assert.equal(
      login.searchParams.get('returnTo'),
      '/settings/email',
      'SMTP recovery link carries its actual route',
    );
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    const observer = await observeAccountLogin(page);
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        await page.waitForFunction(
          () => !document.querySelector('button[type="submit"]').disabled,
        );
        await observer.reset();
        await page.focus('loc=role:button[name="登录"]');
        await page.keyboard.press('Enter');
        await page.waitForFunction(
          () =>
            location.pathname !== '/login' ||
            window.__accountFault?.observed.responses.some(
              (response) => response.status >= 400,
            ),
        );
        const destination = new URL(await page.url()).pathname;
        if (destination !== '/login') {
          assert.equal(
            destination,
            '/settings/email',
            'Actual successful login honors the SMTP recovery destination',
          );
          break;
        }
        const limited = await observer.lastFailure();
        assert.equal(
          limited.status,
          429,
          'Recovery login retries only actual auth rate limiting',
        );
        assert.ok(
          limited.retryAfter > 0 && limited.retryAfter <= 60 && attempt < 3,
        );
        report.requests.push({
          ...limited,
          method: 'POST',
          width,
          source: 'smtp-expired-link-login',
          attempt,
        });
        await delay(
          Math.max(
            0,
            limited.receivedAt + limited.retryAfter * 1000 - Date.now(),
          ),
        );
      }
      await page.waitForURL(`${config.origin}/settings/email`);
      await smtpReady(page);
      assert.equal(
        await smtpValue(page, 'password'),
        '',
        'Returning through the real login flow never restores the expired password input',
      );
    } finally {
      await observer.dispose();
    }
  };

  // The write really commits before sign-out; only its browser response is held.
  await seeded(fixture.targets.tls);
  await smtpFill(page, 'from-name', `过期前真实保存 ${width}`);
  await smtpFill(page, 'password', fixture.password);
  const oldWrite = await smtpTransport(page, { method: 'PATCH', hold: true });
  try {
    await ui.activate('save');
    assert.equal(
      (await oldWrite.settled()).responses.find(
        (item) => item.method === 'PATCH',
      ).status,
      200,
    );
    await signedOut();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expired();
    await ui.geometry(`session-before-late-write-${width}`);
    await oldWrite.release();
    await page.waitForFunction(() => window.__smtpTransport.deliveryFrame >= 1);
    await expired();
    await noLateFeedback();
    await ui.geometry(`session-after-late-write-${width}`);
  } finally {
    await oldWrite.dispose();
  }
  await signBackIn();

  // Hold a real background null so the SMTP POST itself delivers the actual 401 first.
  await seeded(fixture.targets.tls);
  await smtpFill(page, 'password', fixture.password);
  const receivedBefore401 = (
    await (await fetch(`${fixture.control}/state`)).json()
  ).tls.received.length;
  await signedOut();
  const unauthorized = await smtpTransport(page, { holdSession: true });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() =>
      window.__smtpTransport.sessionReads.some((read) => read.empty),
    );
    await ui.activate('test');
    await page.waitForSelector(smtpControl('dialog-test-confirm'));
    await ui.activate('test-confirm');
    const observed = await unauthorized.settled('POST');
    assert.equal(
      observed.responses.find((item) => item.method === 'POST').status,
      401,
      'SMTP sends no mail through an expired owner session',
    );
    assert.equal(
      (await (await fetch(`${fixture.control}/state`)).json()).tls.received
        .length,
      receivedBefore401,
      'The SMTP fixture receives no mail for the unauthorized request',
    );
    await expired();
    await ui.geometry(`smtp-401-session-${width}`);
    await unauthorized.release();
    await page.waitForFunction(
      () => window.__smtpTransport.sessionDeliveryFrame >= 1,
    );
    await expired();
    await noLateFeedback();
  } finally {
    await unauthorized.dispose();
  }
  await recoverThroughLink();

  for (const phase of ['save', 'send', 'readback']) {
    await seeded(fixture.targets.tls);
    if (phase !== 'send') {
      await smtpFill(page, 'from-name', `离页前真实操作 ${phase} ${width}`);
      await smtpFill(page, 'password', fixture.password);
    }
    const held = await smtpTransport(
      page,
      phase === 'readback'
        ? { method: 'PATCH', lose: true, holdReadAfterWrite: true }
        : { method: phase === 'send' ? 'POST' : 'PATCH', hold: true },
    );
    try {
      const documentId = await page.evaluate(
        () => (window.__smtpLifetimeDocument = crypto.randomUUID()),
      );
      await ui.activate(phase === 'send' ? 'test' : 'save');
      const responseMethod =
        phase === 'readback' ? 'GET' : phase === 'send' ? 'POST' : 'PATCH';
      const observed = await held.settled(responseMethod);
      assert.equal(
        observed.responses.find((item) => item.method === responseMethod)
          .status,
        200,
        'Navigation holds a complete real response',
      );
      if (width < 1200) {
        await page.click('button[aria-label="菜单"]');
        await page.waitForSelector('[role="dialog"][aria-label="导航菜单"]');
      }
      const receipt = await page.click('a[href="/library"][aria-label="图库"]');
      assert.ok(
        !receipt.dialog,
        'SMTP pending operations do not prevent ordinary internal navigation',
      );
      await page.waitForFunction(
        () =>
          location.pathname === '/library' &&
          !document.querySelector('[data-testid="smtp-page"]'),
      );
      assert.equal(
        await page.evaluate(() => window.__smtpLifetimeDocument),
        documentId,
        'The actual client navigation unmounts SMTP while retaining the document and held request',
      );
      await held.release();
      await page.waitForFunction(
        (method) =>
          window.__smtpTransport.deliveryFrame >= 1 &&
          window.__smtpTransport.delivered.some(
            (item) => item.method === method,
          ),
        responseMethod,
      );
      assert.equal(
        new URL(await page.url()).pathname,
        '/library',
        'Late SMTP completion retains the destination route',
      );
      assert.equal(
        await page.evaluate(
          () =>
            !!document.querySelector(
              '[data-testid="smtp-page"],[data-testid="smtp-password"],[data-testid="smtp-pending"]',
            ),
        ),
        false,
        'Late completion cannot restore the unmounted SMTP UI or secret',
      );
      await noLateFeedback();
      await ui.screenshot(`unmounted-late-${phase}-${width}`);
    } finally {
      await held.dispose();
    }
  }
  await smtpOpen(page, config);
  report.checks.push(
    `${width}: actual sign-out plus held successful save cannot overwrite expiry; SMTP itself returns real 401 before held background null; the actual recovery link and credential form return to /settings/email with an empty password; client navigation unmounts held save/send/readback without late SMTP feedback or secret controls.`,
  );
}
