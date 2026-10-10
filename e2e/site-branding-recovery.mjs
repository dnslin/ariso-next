import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  control,
  screen,
  brandingFault,
  watchBlobUrls,
  assertBlobReleased,
} from './site-branding-helpers.mjs';
import { identitySql } from './identity-session.mjs';
import { resizeViewport } from './browser-geometry.mjs';

export async function verifyBrandingRecovery(page, config, tools, report) {
  let fault;
  try {
    fault = await brandingFault(page, { readHold: true }, true);
    await page.goto(`${config.origin}/settings/general/branding`);
    await fault.wait();
    await page.waitForSelector(`${screen}[data-state="loading"]`);
    for (const width of [390, 1440])
      for (const theme of ['light', 'dark'])
        await tools.evidence('loading', width, theme);
    await fault.release();
    await page.waitForSelector(`${screen}[data-state="ready"]`);
  } finally {
    await fault?.dispose();
  }
  try {
    fault = await brandingFault(page, { readError: true }, true);
    await page.goto(`${config.origin}/settings/general/branding`);
    await page.waitForSelector(`${screen}[data-state="error"]`);
    for (const width of [390, 1440])
      for (const theme of ['light', 'dark'])
        await tools.evidence('read-error', width, theme);
    await fault.update({ readError: false });
    await page.click('[data-testid="branding-reload"]');
    await page.waitForSelector(`${screen}[data-state="ready"]`);
  } finally {
    await fault?.dispose();
  }
  const directory = join(config.output, 'site-branding-invalid');
  await mkdir(directory, { recursive: true });
  try {
    const file = join(directory, 'unsafe.svg');
    await writeFile(
      file,
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><script>window.__brandingExecuted=true</script></svg>',
    );
    await tools.open();
    await watchBlobUrls(page);
    const before = await tools.api();
    await page.setInputFiles(control('logo', 'file'), [file]);
    await tools.state('selected');
    const preview = await page.evaluate(
      () => document.querySelector('[data-testid="branding-logo-preview"]').src,
    );
    await page.click(control('logo', 'save'));
    await tools.state('failed');
    assert.equal((await tools.api()).logoUrl, before.logoUrl);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="branding-logo-preview"]').src,
      ),
      preview,
      'A confirmed rejection retains the exact local file preview',
    );
    assert.equal(
      await page.evaluate(
        (url) => window.__brandingBlobs.revoked.includes(url),
        preview,
      ),
      false,
    );
    assert.equal(
      await page.evaluate(() => window.__brandingExecuted === true),
      false,
    );
    for (const width of [390, 1440])
      for (const theme of ['light', 'dark'])
        await tools.evidence('confirmed-rejection', width, theme);
    await page.click(control('logo', 'cancel'));
    await assertBlobReleased(page, preview, 'cancel failed upload');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  for (const useServer of [true, false]) {
    await tools.open();
    await watchBlobUrls(page);
    await tools.choose('logo', useServer ? 'source.png' : 'second.png');
    const preview = await page.evaluate(
      () => document.querySelector('[data-testid="branding-logo-preview"]').src,
    );
    fault = await brandingFault(page, { lost: true, readError: true });
    try {
      await page.click(control('logo', 'save'));
      await fault.wait();
      await tools.state('saving');
      for (const width of [390, 1440])
        for (const theme of ['light', 'dark'])
          await tools.evidence('saving', width, theme);
      await fault.release();
      await tools.state('unknown');
      assert.equal(
        (await fault.observed()).reads,
        0,
        'Uncertain mutation does not automatically read or replay',
      );
      for (const width of [390, 1440])
        for (const theme of ['light', 'dark'])
          await tools.evidence('unknown-upload', width, theme);
      await page.click(control('logo', 'retry-read'));
      await tools.state('check-error');
      assert.equal((await fault.observed()).writes, 1);
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('[data-testid="branding-logo-preview"]').src,
        ),
        preview,
      );
      for (const width of [390, 1440])
        for (const theme of ['light', 'dark'])
          await tools.evidence('unconfirmed', width, theme);
      await fault.update({ readError: false, lost: false });
      await page.click(control('logo', 'retry-read'));
      await tools.state('different');
      const observed = await fault.observed();
      assert.equal(
        observed.writes,
        1,
        'Read reconciliation does not replay the PUT',
      );
      assert.ok(observed.reads >= 1);
      for (const width of [390, 1440])
        for (const theme of ['light', 'dark'])
          await tools.evidence('server-result', width, theme);
      await page.click(control('logo', useServer ? 'use-server' : 'retry'));
      if (useServer) {
        await page.waitForSelector('[data-testid="branding-logo"]');
        await assertBlobReleased(page, preview, 'explicitly adopt server');
      } else {
        await tools.state('selected');
        assert.equal(
          (await fault.observed()).writes,
          1,
          'Keeping the file only unlocks the explicit save',
        );
        assert.equal(
          await page.evaluate(
            () =>
              document.querySelector('[data-testid="branding-logo-preview"]')
                .src,
          ),
          preview,
        );
        await tools.save('logo');
        assert.equal(
          (await fault.observed()).writes,
          2,
          'The second write follows the explicit save only',
        );
        await assertBlobReleased(page, preview, 'explicit retry success');
      }
      report.checks.push(
        `Real committed response loss retains File, reads without replay, and ${useServer ? 'adopts the server result' : 'requires a second explicit save'} only after user choice.`,
      );
    } finally {
      await fault.dispose();
    }
  }
  await tools.open();
  await tools.choose('logo');
  const saved = await tools.save('logo');
  const assetPath = join(
    config.dataDirectory,
    'assets',
    'branding',
    saved.logoKey,
  );
  const originalBytes = await readFile(assetPath);
  try {
    report.expectedResourceFailures ??= [];
    report.expectedResourceFailures.push(`${config.origin}${saved.logoUrl}`);
    await rm(assetPath);
    await page.cdp('Network.setCacheDisabled', { cacheDisabled: true });
    await tools.open();
    await page.waitForSelector(
      '[data-testid="branding-logo"][data-state="missing"]',
    );
    assert.equal(
      (await tools.api()).logoUrl,
      saved.logoUrl,
      'Missing file retains the actual server reference',
    );
    for (const width of [390, 1440]) {
      await resizeViewport(page, width);
      await page.waitForFunction((width) => {
        const logo = document.querySelector(
          `${width === 390 ? '.shell-mobile-header' : '.shell-navigation'} [data-testid="site-logo"]`,
        );
        return (
          logo !== null &&
          !logo.querySelector('img') &&
          logo.textContent.trim() === 'Logo 无法加载'
        );
      }, width);
      for (const theme of ['light', 'dark'])
        await tools.evidence('missing-file', width, theme);
    }
  } finally {
    await writeFile(assetPath, originalBytes);
    await page.cdp('Network.setCacheDisabled', { cacheDisabled: false });
  }
  for (const unsent of [false, true]) {
    await tools.open();
    await tools.choose('logo');
    await tools.save('logo');
    fault = await brandingFault(
      page,
      unsent ? { unsent: true, readError: true } : { lost: true },
    );
    try {
      await page.click(control('logo', 'delete'));
      await page.waitForSelector('[role="alertdialog"]');
      await page.click(control('logo', 'confirm-delete'));
      if (!unsent) {
        await fault.wait();
        await fault.release();
      }
      await tools.state('unknown');
      assert.equal((await fault.observed()).writes, 1);
      assert.equal(
        (await fault.observed()).reads,
        0,
        'Uncertain delete never automatically reads or writes',
      );
      for (const width of [390, 1440])
        for (const theme of ['light', 'dark'])
          await tools.evidence('unknown-delete', width, theme);
      await page.click(control('logo', 'retry-read'));
      if (unsent) {
        await tools.state('check-error');
        assert.equal(
          (await fault.observed()).writes,
          1,
          'Failed delete reconciliation does not replay DELETE',
        );
        for (const width of [390, 1440])
          for (const theme of ['light', 'dark'])
            await tools.evidence('unconfirmed-delete', width, theme);
        await fault.update({ readError: false });
        await page.click(control('logo', 'retry-read'));
        await tools.state('different');
        assert.equal((await fault.observed()).writes, 1);
        for (const width of [390, 1440])
          for (const theme of ['light', 'dark'])
            await tools.evidence('server-result-delete', width, theme);
        await fault.update({ unsent: false });
        await page.click(control('logo', 'retry'));
      }
      await page.waitForSelector('[role="alertdialog"]', { state: 'hidden' });
      assert.equal((await tools.api()).logoUrl, null);
      assert.equal((await fault.observed()).writes, unsent ? 2 : 1);
      report.checks.push(
        unsent
          ? 'Unsent delete reads the retained server reference, then only an explicit confirmed retry removes it.'
          : 'Committed delete response loss is resolved by a GET with no repeat DELETE.',
      );
    } finally {
      await fault.dispose();
    }
  }
  // Keep the DELETE unsent, then expire the real session before its explicit
  // reconciliation GET. Recovery must remain reachable inside the locked dialog.
  await tools.open();
  await tools.choose('logo');
  const retained = await tools.save('logo');
  fault = await brandingFault(page, { unsent: true });
  try {
    await page.click(control('logo', 'delete'));
    await page.waitForSelector('[role="alertdialog"]');
    await page.click(control('logo', 'confirm-delete'));
    await tools.state('unknown');
    await identitySql(
      config,
      `UPDATE session SET expires_at=${Date.now() - 1000}`,
    );
    await page.click(control('logo', 'retry-read'));
    await page.waitForSelector(`${screen}[data-state="expired"]`);
    const observed = await fault.observed();
    assert.equal(
      observed.writes,
      1,
      'Expired reconciliation never repeats DELETE',
    );
    assert.ok(
      observed.requests.some(
        (request) => request.method === 'GET' && request.status === 401,
      ),
      'Reconciliation observes an actual expired-session response',
    );
    const loginLink =
      '[role="alertdialog"] a[href="/login?reason=expired&returnTo=%2Fsettings%2Fgeneral%2Fbranding"]';
    await page.waitForSelector(loginLink);
    await tools.state('unknown');
    assert.doesNotMatch(
      await page.evaluate(
        () => document.querySelector('[role="alertdialog"]').textContent,
      ),
      /正在核对|正在移除/,
      'A completed 401 leaves no in-progress deletion or reconciliation state',
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="branding-logo-retry-read"]')
            .disabled,
      ),
      true,
    );
    for (const width of [390, 1440])
      for (const theme of ['light', 'dark'])
        await tools.evidence('expired-delete', width, theme);
    await page.focus(loginLink);
    await page.keyboard.press('Enter');
    await page.waitForSelector('[role="dialog"]:has-text("放弃未保存的修改")');
    await page.click('loc=role:button[name="放弃修改"]');
    await page.waitForSelector('#email');
    assert.equal(
      new URL(await page.url()).searchParams.get('returnTo'),
      '/settings/general/branding',
    );
  } finally {
    await fault.dispose();
  }
  await page.fill('#email', config.credentials.email);
  await page.fill('#password', config.credentials.password);
  await page.click('loc=role:button[name="登录"]');
  await page.waitForURL(`${config.origin}/settings/general/branding`);
  await page.waitForSelector(`${screen}[data-state="ready"]`);
  assert.equal(
    (await tools.api()).logoUrl,
    retained.logoUrl,
    'Reauthentication returns to branding and preserves the undeleted asset',
  );
  report.checks.push(
    'An unknown delete followed by a real 401 leaves a keyboard-reachable sign-in link inside its locked dialog; explicit discard and real UI login return to branding without replaying DELETE.',
  );
  // The shared shell observes real background expiry before any upload is sent.
  await tools.open();
  const beforeExpiry = await tools.api();
  await watchBlobUrls(page);
  await tools.choose('favicon');
  const selectedPreview = await page.evaluate(
    () =>
      document.querySelector('[data-testid="branding-favicon-preview"]').src,
  );
  fault = await brandingFault(page);
  try {
    // Better Auth's real memory bucket resets after 10 seconds without a
    // successful request. The combined suite must not spend that bucket on
    // preceding layout/navigation checks before testing background expiry.
    await page.evaluate(() => {
      const original = window.fetch;
      const observation = {
        original,
        pending: 0,
        lastActivity: Date.now(),
        requests: [],
      };
      window.__brandingSessionQuiet = observation;
      window.fetch = async (...args) => {
        const input = args[0];
        const path = new URL(
          typeof input === 'string' ? input : input.url,
          location.href,
        ).pathname;
        if (path !== '/api/auth/get-session') return original(...args);
        const request = { startedAt: Date.now() };
        observation.requests.push(request);
        observation.pending++;
        observation.lastActivity = request.startedAt;
        try {
          const response = await original(...args);
          request.status = response.status;
          return response;
        } finally {
          request.finishedAt = Date.now();
          observation.lastActivity = request.finishedAt;
          observation.pending--;
        }
      };
    });
    try {
      await page.waitForFunction(
        () => {
          const observation = window.__brandingSessionQuiet;
          return (
            observation.pending === 0 &&
            Date.now() - observation.lastActivity >= 11000
          );
        },
        undefined,
        { timeout: 70000 },
      );
    } finally {
      report.sessionQuiet = await page.evaluate(() => {
        const observation = window.__brandingSessionQuiet;
        const result = {
          quietMs: Date.now() - observation.lastActivity,
          pending: observation.pending,
          requests: observation.requests,
        };
        window.fetch = observation.original;
        delete window.__brandingSessionQuiet;
        return result;
      });
    }
    assert.ok(report.sessionQuiet.quietMs >= 11000);
    assert.equal(report.sessionQuiet.pending, 0);
    await identitySql(
      config,
      `UPDATE session SET expires_at=${Date.now() - 1000}`,
    );
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForSelector(`${screen}[data-state="expired"]`);
    assert.equal(
      new URL(await page.url()).pathname,
      '/settings/general/branding',
      'Background session expiry retains the page and selected File',
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="branding-favicon-preview"]')
            .src,
      ),
      selectedPreview,
    );
    assert.match(selectedPreview, /^blob:/);
    assert.equal(
      await page.evaluate(
        (url) => window.__brandingBlobs.revoked.includes(url),
        selectedPreview,
      ),
      false,
      'Background expiry preserves the same unreleased local preview',
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="branding-favicon-save"]')
            .disabled,
      ),
      true,
    );
    for (const width of [390, 1440])
      for (const theme of ['light', 'dark'])
        await tools.evidence('expired-selection', width, theme);
    assert.equal(
      (await fault.observed()).writes,
      0,
      'Background session expiry never sends a PUT',
    );
  } finally {
    await fault.dispose();
  }
  await page.click(
    'a[href="/login?reason=expired&returnTo=%2Fsettings%2Fgeneral%2Fbranding"]',
  );
  await page.waitForSelector('[role="dialog"]:has-text("放弃未保存的修改")');
  await page.click('loc=role:button[name="放弃修改"]');
  await page.waitForSelector('#email');
  await page.fill('#email', config.credentials.email);
  await page.fill('#password', config.credentials.password);
  await page.click('loc=role:button[name="登录"]');
  await page.waitForURL(`${config.origin}/settings/general/branding`);
  await page.waitForSelector(`${screen}[data-state="ready"]`);
  assert.equal(
    (await tools.api()).faviconUrl,
    beforeExpiry.faviconUrl,
    'Background expiry and reauthentication never persist the selected file',
  );
  report.checks.push(
    'The real shared-shell focus check observes background session expiry, sends no PUT, retains the same local preview and disabled save, and real sign-in returns to branding without persisting that selection.',
  );
}
