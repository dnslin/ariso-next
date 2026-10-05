import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { identitySql } from './identity-session.mjs';
import {
  accountRequest,
  accountSignIn,
  independentAccountSession,
  assertPersistedPassword,
} from './account-auth.mjs';
import {
  accountWriteFault,
  passwordRaceFault,
  accountLogoutFault,
} from './account-transport.mjs';
import {
  accountButton as button,
  accountDialog as dialog,
  createAccountPage,
} from './account-page.mjs';

export async function verifyPasswordConflict(
  page,
  config,
  report,
  credentials,
  width,
  registerSecret,
) {
  const ui = createAccountPage(page, config, report);
  const { open, fields, fieldError, valuesRemain, successful, stateGeometry } =
    ui;
  const currentEmail = credentials.email;
  let currentPassword = credentials.password;
  // Real crypto completion order is nondeterministic. A valid UI winner is
  // recorded before another distinct race; the 409 UI branch remains required.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const snapshot = await open('password');
    const concurrentPassword = randomBytes(18).toString('hex');
    const proposedPassword = randomBytes(18).toString('hex');
    registerSecret(concurrentPassword, proposedPassword);
    await fields({
      currentPassword,
      newPassword: proposedPassword,
      confirmPassword: proposedPassword,
    });
    const race = await passwordRaceFault(page, concurrentPassword);
    let actual;
    try {
      await page.click(button('保存密码'));
      const observed = await race.result();
      actual = {
        otherStatus: observed.otherStatus,
        otherCode: observed.otherCode,
        ownStatus: observed.ownStatus,
        ownCode: observed.ownCode,
      };
    } finally {
      await race.dispose();
    }
    report.requests.push({
      path: '/api/account/password',
      method: 'POST',
      attempt,
      width,
      status: actual.ownStatus,
      concurrentWriterStatus: actual.otherStatus,
      concurrentWriterCode: actual.otherCode,
      code: actual.ownCode,
    });
    if (actual.ownStatus === 200) {
      assert.deepEqual(actual, {
        otherStatus: 409,
        otherCode: 'ACCOUNT_PASSWORD_CHANGED',
        ownStatus: 200,
        ownCode: 'ACCOUNT_PASSWORD_UPDATED',
      });
      await successful('password', currentEmail, snapshot, width);
      currentPassword = proposedPassword;
      await assertPersistedPassword(config, currentPassword);
      await stateGeometry(`password-concurrent-ui-winner-${attempt}`, width);
      continue;
    }
    assert.deepEqual(actual, {
      otherStatus: 200,
      otherCode: 'ACCOUNT_PASSWORD_UPDATED',
      ownStatus: 409,
      ownCode: 'ACCOUNT_PASSWORD_CHANGED',
    });
    await fieldError('currentPassword');
    await valuesRemain({
      currentPassword: '',
      newPassword: proposedPassword,
      confirmPassword: proposedPassword,
    });
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="account-dialog"] [role="alert"]')
        ?.textContent.includes('核对期间密码已发生变化'),
    );
    await stateGeometry('password-conflict', width);
    currentPassword = concurrentPassword;
    await assertPersistedPassword(config, currentPassword);
    await page.fill('#currentPassword', currentPassword);
    await page.click(button('保存密码'));
    await successful('password', currentEmail, snapshot, width);
    currentPassword = proposedPassword;
    await assertPersistedPassword(config, currentPassword);
    report.checks.push(
      'Two real password HTTP requests race: the other writer commits and the UI receives 409, clears only the current password, preserves both proposed fields, focuses the associated error and succeeds only after an explicit retry with the actual current password.',
    );
    return { email: currentEmail, password: currentPassword };
  }
  assert.fail(
    'Three real races did not reach the required UI 409 recovery branch',
  );
}
export async function verifyPasswordChanges(
  page,
  config,
  report,
  credentials,
  width,
  registerSecret,
) {
  const ui = createAccountPage(page, config, report);
  const request = (path, method, body) =>
    accountRequest(page, report, width, path, method, body);
  const { open, fields, fieldError, valuesRemain, successful, stateGeometry } =
    ui;
  const currentEmail = credentials.email;
  let currentPassword = credentials.password;
  const snapshot = await open('password');
  const newPassword = randomBytes(18).toString('hex');
  registerSecret(newPassword);
  await fields({
    currentPassword,
    newPassword,
    confirmPassword: `${newPassword}x`,
  });
  await page.click(button('保存密码'));
  await fieldError('confirmPassword');
  await valuesRemain({
    currentPassword,
    newPassword,
    confirmPassword: `${newPassword}x`,
  });
  await fields({
    currentPassword: 'incorrect-password',
    confirmPassword: newPassword,
  });
  await page.click(button('保存密码'));
  await fieldError('currentPassword');
  await valuesRemain({
    currentPassword: 'incorrect-password',
    newPassword,
    confirmPassword: newPassword,
  });
  await stateGeometry('password-current-password-error', width);
  await page.fill('#currentPassword', currentPassword);
  const otherSession = await independentAccountSession(
    config,
    report,
    credentials,
    width,
    registerSecret,
  );
  const write = await accountWriteFault(page, '/api/account/password');
  try {
    await page.click(button('保存密码'));
    await ui.pending('password', width, write);
    await write.release();
    await successful('password', currentEmail, snapshot, width);
  } finally {
    await write.dispose();
  }
  const revoked = await otherSession();
  assert.equal(
    revoked.status,
    401,
    'Real password change revokes the independent Cookie session',
  );
  assert.equal(revoked.payload.code, 'UNAUTHORIZED');
  await stateGeometry('password-success', width);
  const oldPassword = currentPassword;
  currentPassword = newPassword;
  const oldLogin = await request('/api/auth/sign-in/email', 'POST', {
    email: currentEmail,
    password: oldPassword,
  });
  assert.equal(oldLogin.status, 401, 'Old password cannot create a session');
  assert.equal(
    (await request('/api/auth/get-session')).payload.user.email,
    currentEmail,
  );
  report.checks.push(
    'Confirmation mismatch and real invalid old password preserve all entered fields; real password commits once, closes to Toast, current session survives, the independent real Cookie session is revoked and old password login fails.',
  );

  // Passwords cannot be reread. Preserve an uncertain result after a successful
  // actual write and require explicit sign-in rather than sending it again.
  await open('password');
  const unknownPassword = randomBytes(18).toString('hex');
  registerSecret(unknownPassword);
  const preserved = {
    currentPassword,
    newPassword: unknownPassword,
    confirmPassword: unknownPassword,
  };
  await fields(preserved);
  const unknownWrite = await accountWriteFault(
    page,
    '/api/account/password',
    true,
  );
  try {
    await page.click(button('保存密码'));
    assert.equal((await unknownWrite.result()).status, 200);
    await unknownWrite.release();
    await page.waitForSelector(button('前往登录核对'));
    assert.equal(
      await page.evaluate(
        (selector) =>
          document.querySelector(`${selector} button[type="submit"]`),
        dialog,
      ),
      null,
      'An uncertain password result has no resubmit action',
    );
    assert.equal((await unknownWrite.result()).requests, 1);
    await stateGeometry('password-unknown', width);
  } finally {
    await unknownWrite.dispose();
  }
  await identitySql(
    config,
    "CREATE TRIGGER reject_account_browser_logout BEFORE DELETE ON session BEGIN SELECT RAISE(ABORT, 'Account logout deletion failure'); END",
  );
  try {
    await page.click(button('前往登录核对'));
    await page.waitForFunction(() =>
      document
        .querySelector(
          '[data-testid="account-dialog"][data-state="unknown"] [role="alert"]',
        )
        ?.textContent.includes('HTTP 500'),
    );
    assert.equal(new URL(await page.url()).pathname, '/settings/account');
    assert.equal(
      (await request('/api/auth/get-session')).payload.user.email,
      currentEmail,
    );
    await stateGeometry('password-check-logout-error', width);
  } finally {
    await identitySql(config, 'DROP TRIGGER reject_account_browser_logout');
  }
  // The background check starts before logout; it reads the deleted session
  // while the explicit successful logout response is still held in transit.
  const logout = await accountLogoutFault(page);
  try {
    await logout.waitForBackground();
    await page.click(button('前往登录核对'));
    const observed = await logout.result();
    assert.equal(observed.status, 200);
    assert.equal(observed.session, null);
    assert.equal(new URL(await page.url()).pathname, '/settings/account');
    assert.equal(
      await page.evaluate(
        (selector) => document.querySelector(selector)?.dataset.state,
        dialog,
      ),
      'signing-out',
      'Background null cannot unmount the recovery modal during explicit logout',
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="account-page"]')?.dataset.state,
      ),
      'ready',
      'Background null cannot replace the page with expired-session recovery',
    );
    report.requests.push({
      path: '/api/auth/sign-out',
      method: 'POST',
      width,
      status: observed.status,
      backgroundSession: observed.session,
      heldRealResponse: true,
    });
    await stateGeometry('password-check-logout-pending', width);
    await logout.release();
    await page.waitForSelector('#password');
  } finally {
    await logout.dispose();
  }
  const login = new URL(await page.url());
  assert.equal(login.pathname, '/login');
  assert.equal(login.searchParams.get('reason'), 'signed-out');
  assert.equal(login.searchParams.get('returnTo'), '/settings/account');
  assert.equal((await request('/api/auth/get-session')).payload, null);
  currentPassword = unknownPassword;
  await accountSignIn(
    page,
    config,
    report,
    { email: currentEmail, password: currentPassword },
    width,
  );
  report.checks.push(
    'Lost response after actual password commit never retries or pretends the old value survived; the unknown result offers no resubmit action; real logout persistence failure keeps its recovery modal and current session, background real null cannot override the pending explicit logout, which carries the account destination to login and new credentials enter the same page.',
  );
  return { email: currentEmail, password: currentPassword };
}
