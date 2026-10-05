import assert from 'node:assert/strict';
import { identitySql } from './identity-session.mjs';
import { accountRequest } from './account-auth.mjs';
import {
  accountWriteFault,
  emailReconcileFault,
} from './account-transport.mjs';
import {
  accountButton as button,
  accountDialog as dialog,
  createAccountPage,
} from './account-page.mjs';

export async function verifyEmailChanges(
  page,
  config,
  report,
  credentials,
  width,
) {
  const ui = createAccountPage(page, config, report);
  const request = (path, method, body) =>
    accountRequest(page, report, width, path, method, body);
  const snapshot = await ui.open('email');
  await ui.fields({ email: '', currentPassword: '' });
  await page.click(button('保存邮箱'));
  await ui.fieldError('email');
  const newEmail = `account-${width}@example.test`;
  const input = {
    email: ` ${newEmail.toUpperCase()} `,
    currentPassword: 'incorrect-password',
  };
  await ui.fields(input);
  await page.click(button('保存邮箱'));
  await ui.fieldError('currentPassword');
  await ui.valuesRemain(input);
  assert.equal(
    (await request('/api/account')).payload.email,
    credentials.email,
  );
  await ui.stateGeometry('email-current-password-error', width);
  await page.fill('#currentPassword', credentials.password);
  await identitySql(config, 'UPDATE user SET email_verified=1');
  const write = await accountWriteFault(page, '/api/account/email');
  try {
    await page.click(button('保存邮箱'));
    await ui.pending('email', width, write);
    await write.release();
    await ui.successful('email', newEmail, snapshot, width);
  } finally {
    await write.dispose();
  }
  await ui.stateGeometry('email-success', width);
  assert.deepEqual((await request('/api/account')).payload, {
    email: newEmail,
  });
  const oldLogin = await request(
    '/api/auth/sign-in/email',
    'POST',
    credentials,
  );
  assert.equal(oldLogin.status, 401, 'Old email cannot create a session');
  assert.equal(
    (await request('/api/auth/get-session')).payload.user.email,
    newEmail,
  );
  report.checks.push(
    'Real invalid current password leaves email unchanged and preserves fields; normalized email commits once, closes to neutral Toast and preserves the current session; old email login fails.',
  );

  // Lose the real committed response, then hold the actual account reread so
  // the reconciliation UI remains observable before it receives server data.
  const recoveredSnapshot = await ui.open('email');
  const recoveredEmail = `account-recovered-${width}@example.test`;
  await ui.fields({
    email: recoveredEmail,
    currentPassword: credentials.password,
  });
  const reconcile = await emailReconcileFault(page, true);
  try {
    await page.click(button('保存邮箱'));
    assert.equal((await reconcile.result()).status, 200);
    await page.waitForSelector(`${dialog}[data-state="checking"]`);
    assert.equal(
      await page.evaluate(
        (selector) =>
          document.querySelector(`${selector} button[type="submit"]`),
        dialog,
      ),
      null,
    );
    await ui.stateGeometry('email-reconciling', width);
    await reconcile.release();
    await ui.verifiedEmail(
      recoveredEmail,
      'email-reconciled',
      recoveredSnapshot,
      width,
    );
  } finally {
    await reconcile.dispose();
  }
  report.checks.push(
    'Lost response after real email commit triggers a real account reread; while held it cannot resubmit, and the same modal reports only the actual current email before returning with focus and scrolling intact.',
  );

  const unchangedSnapshot = await ui.open('email');
  await ui.fields({
    email: `account-unsent-${width}@example.test`,
    currentPassword: credentials.password,
  });
  const unreadable = await emailReconcileFault(page, false);
  try {
    await page.click(button('保存邮箱'));
    await unreadable.result();
    await page.waitForSelector(button('重新核对邮箱'));
    await page.waitForSelector(`${dialog}[data-state="unknown"]`);
    assert.equal(
      await page.evaluate(
        (selector) =>
          document.querySelector(`${selector} button[type="submit"]`),
        dialog,
      ),
      null,
    );
    await ui.stateGeometry('email-reconcile-error', width);
  } finally {
    await unreadable.dispose();
  }
  await page.click(button('重新核对邮箱'));
  await ui.verifiedEmail(
    recoveredEmail,
    'email-reconciled-unchanged',
    unchangedSnapshot,
    width,
  );
  assert.equal((await request('/api/account')).payload.email, recoveredEmail);
  report.checks.push(
    'Unsent email plus failed reread stays unknown without a submit action; explicit real reread verifies the unchanged current email and returns to the same account page.',
  );
  return { email: recoveredEmail, password: credentials.password };
}
