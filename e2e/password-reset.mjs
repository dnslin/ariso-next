/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { randomBytes } = await import('node:crypto');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { setTimeout: delay } = await import('node:timers/promises');
const base = config.identitySessionScript;
const [
  { identitySql },
  { resizeViewport, setTheme, readGeometry, assertGeometry },
  { observePasswordReset },
] = await Promise.all([
  import(base),
  import(new URL('./browser-geometry.mjs', base).href),
  import(new URL('./password-reset-transport.mjs', base).href),
]);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const fixture = config.passwordResetFixture;
assert.ok(fixture, 'Recovery needs the isolated real SMTP fixture');
const report = {
  status: 'failed',
  phase: config.passwordResetPhase ?? 'all',
  taskSpaceId: task.spaceId,
  checks: [],
  screenshots: [],
  layouts: [],
  requests: [],
  rateLimits: [],
  acceptedTextLayouts: [],
};
const privateValues = [config.credentials.password];
const sanitize = (value) =>
  privateValues.reduce(
    (text, secret) => text.replaceAll(secret, '[redacted]'),
    String(value),
  );
const selector = (name) => `[data-testid="reset-${name}"]`;
async function noTerminalContent() {
  assert.deepEqual(
    await page.evaluate(() => ({
      terminalText:
        /终端|容器|docker\s+exec|dist\/cli|reset-password\.js/i.test(
          document.body.innerText,
        ),
      terminalLinks: [...document.querySelectorAll('a')].some((node) =>
        /view=cli|dist\/cli|reset-password\.js/i.test(
          node.getAttribute('href') ?? '',
        ),
      ),
      terminalCommand: !!document.querySelector(
        '[data-testid="reset-cli"], pre, code',
      ),
    })),
    { terminalText: false, terminalLinks: false, terminalCommand: false },
    'Public recovery states expose no terminal instructions, links or commands',
  );
}
async function state(name) {
  await page.waitForSelector(`${selector('page')}[data-state="${name}"]`);
  await noTerminalContent();
}
const open = async (path = '/forgot-password') => {
  await page.goto(`${config.origin}${path}`);
  await page.waitForSelector(path === '/login' ? '#email' : selector('page'));
};
const activate = async (name) => {
  await page.focus(selector(name));
  await page.keyboard.press('Enter');
};
const messages = async () => {
  const response = await fetch(`${fixture.control}/messages`, {
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200, 'Real local SMTP capture is reachable');
  return response.json();
};
async function latestMail(name = 'accepted') {
  const mail = (await messages())[name].at(-1);
  assert.ok(mail, `Real ${name} SMTP listener captured a recovery mail`);
  assert.equal(mail.secure, true);
  assert.deepEqual(mail.recipients, [config.credentials.email]);
  const url = new URL(mail.url);
  privateValues.push(mail.url, url.pathname.split('/').at(-1));
  assert.ok(
    url.origin === config.origin,
    'Recovery mail uses current configured publicUrl',
  );
  assert.ok(
    url.pathname.startsWith('/api/auth/reset-password/'),
    'Mail contains the native library callback',
  );
  return mail.url;
}
async function screenshot(name) {
  await noTerminalContent();
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.timeline instanceof DocumentTimeline &&
            animation.effect?.getTiming().iterations !== Infinity,
        )
        .every((animation) => animation.playState !== 'running'),
    undefined,
    { timeout: 5000 },
  );
  const layout = await readGeometry(page);
  assertGeometry(layout, name);
  report.layouts.push({ name, ...layout });
  const filename = `password-reset-${name}.png`;
  await page.screenshot({ path: join(config.output, filename) });
  report.screenshots.push(filename);
}
async function matrix(name, desktop = 1440) {
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of [desktop, 360, 390, 430, 768]) {
      await resizeViewport(page, width, width >= 1200 ? 960 : 844);
      await screenshot(`${name}-${theme}-${width}`);
    }
    await resizeViewport(page, 390, 400);
    const last = await page.evaluate(() => {
      const node = [...document.querySelectorAll('button,a,input')]
        .filter((item) => item.getClientRects().length && !item.disabled)
        .at(-1);
      if (!node) return null;
      if (node.id) return `#${CSS.escape(node.id)}`;
      if (node.dataset.testid) return `[data-testid="${node.dataset.testid}"]`;
      if (node.matches('a[href]'))
        return `a[href="${node.getAttribute('href')}"] >> nth=-1`;
      throw new Error(
        'Visible short-viewport operation has no stable selector',
      );
    });
    assert.ok(last, 'Short viewport has an operation reachable by keyboard');
    await page.focus(last);
    // A resized page may already have this same control focused. Moving away
    // and returning with real Tab input exercises native focus scrolling again.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => {
      const target = [...document.querySelectorAll('button,a,input')]
        .filter((node) => node.getClientRects().length && !node.disabled)
        .at(-1);
      const rect = target?.getBoundingClientRect();
      return (
        document.activeElement === target &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight
      );
    });
    await screenshot(`${name}-${theme}-short`);
    assert.equal(
      await page.evaluate(() => {
        const r = document.activeElement.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight;
      }),
      true,
      'Short viewport last operation scrolls into view',
    );
  }
  await resizeViewport(page, 1440, 960);
  await setTheme(page, 'light');
}
async function representativeStates(name, desktop = 1440) {
  for (const width of [desktop, 390]) {
    await resizeViewport(page, width, width === desktop ? 960 : 844);
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      if (name === 'accepted')
        await acceptedParagraphLayout(`${theme}-${width}`);
      await screenshot(`${name}-${theme}-${width}`);
    }
  }
  await setTheme(page, 'light');
}
async function acceptedParagraphLayout(label) {
  const layout = await page.evaluate(async () => {
    await document.fonts.ready;
    const paragraphs = document.querySelectorAll(
      '[data-testid="reset-page"][data-state="accepted"] p[role="status"]',
    );
    if (paragraphs.length !== 1)
      throw new Error('Accepted recovery must have one status paragraph');
    const paragraph = paragraphs[0];
    const rect = (range) => {
      const box = range.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        width: box.width,
      };
    };
    const character = (offset) => {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (offset >= node.length) {
          offset -= node.length;
          continue;
        }
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        return rect(range);
      }
      throw new Error('Accepted sentence junction is missing');
    };
    const junction = '如果该邮箱与账号匹配，你将收到密码重置邮件。'.length;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const bounds = paragraph.getBoundingClientRect();
    return {
      text: paragraph.textContent,
      hardBreaks: paragraph.querySelectorAll('br').length,
      bounds: { left: bounds.left, right: bounds.right },
      lines: [...range.getClientRects()]
        .filter((line) => line.width > 0)
        .map((line) => ({ left: line.left, right: line.right })),
      previous: character(junction - 1),
      next: character(junction),
    };
  });
  report.acceptedTextLayouts.push({ label, ...layout });
  assert.equal(
    layout.text,
    '如果该邮箱与账号匹配，你将收到密码重置邮件。请检查收件箱和垃圾邮件。',
    `${label}: both accepted sentences stay in one paragraph`,
  );
  assert.equal(layout.hardBreaks, 0, `${label}: no forced line break`);
  assert.ok(layout.lines.length > 0);
  for (const line of layout.lines)
    assert.ok(
      line.left >= layout.bounds.left - 1 &&
        line.right <= layout.bounds.right + 1,
      `${label}: each rendered text line stays inside the paragraph`,
    );
  const canContinue =
    layout.bounds.right - layout.previous.right >= layout.next.width - 0.5;
  if (canContinue)
    assert.ok(
      Math.abs(layout.previous.top - layout.next.top) <= 1 &&
        layout.next.left >= layout.previous.right - 1,
      `${label}: 请 uses the remaining line space after the first sentence`,
    );
  return canContinue;
}
async function acceptedTips() {
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    let continuousJunctions = 0;
    for (const width of [1920, 360, 390, 430, 768]) {
      await resizeViewport(page, width, width >= 1200 ? 960 : 844);
      await page.mouse.move(1, 1);
      await page.waitForSelector(selector('link-tip-content'), {
        state: 'hidden',
      });
      if (await acceptedParagraphLayout(`tips-closed-${theme}-${width}`))
        continuousJunctions++;
      const mobile = await page.evaluate(
        () => matchMedia('(max-width: 639px)').matches,
      );
      if (mobile) await page.click(selector('link-tip'));
      else await page.hover(selector('link-tip'));
      await page.waitForSelector(selector('link-tip-content'));
      const details = await page.evaluate((s) => {
        const content = document.querySelector(s);
        return {
          role: content.getAttribute('role'),
          text: content.textContent,
        };
      }, selector('link-tip-content'));
      assert.match(details.text, /1\s*小时|一小时/);
      assert.match(details.text, /一次|单次/);
      assert.equal(details.role, mobile ? 'dialog' : 'tooltip');
      await screenshot(`accepted-tips-${theme}-${width}`);
      if (mobile) {
        await page.click(selector('link-tip-close'));
        await page.waitForSelector(selector('link-tip-content'), {
          state: 'hidden',
        });
        await page.waitForFunction(
          (s) => document.activeElement === document.querySelector(s),
          selector('link-tip'),
        );
      } else {
        await page.hover(selector('link-tip-content'));
        assert.equal(
          await page.evaluate(
            (s) => !!document.querySelector(s)?.getClientRects().length,
            selector('link-tip-content'),
          ),
          true,
          'Desktop explanation remains readable when the pointer enters it',
        );
      }
      await page.keyboard.press('Escape');
      await page.waitForSelector(selector('link-tip-content'), {
        state: 'hidden',
      });
      await page.mouse.move(1, 1);
      await page.focus(selector('link-tip'));
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      if (mobile) await page.keyboard.press('Enter');
      await page.waitForSelector(selector('link-tip-content'));
      await page.keyboard.press('Escape');
      await page.waitForSelector(selector('link-tip-content'), {
        state: 'hidden',
      });
      await page.waitForFunction(
        (s) => document.activeElement === document.querySelector(s),
        selector('link-tip'),
      );
    }
    assert.ok(
      continuousJunctions > 0,
      `${theme}: at least one viewport proves the second sentence continues on the existing line`,
    );
  }
  await resizeViewport(page, 1920, 960);
  await setTheme(page, 'light');
  report.checks.push(
    'Accepted link Tips: desktop hover/continuous reading/focus/Escape, mobile click/close/Escape/source focus, both themes and mobile 44px geometry.',
  );
  report.checks.push(
    'Accepted sentences share one naturally wrapping paragraph; real character ranges prove 请 uses available line space and every rendered line stays within bounds at 1920/360/390/430/768 in both themes.',
  );
}
async function requestFormGeometry() {
  return page.evaluate(() =>
    [
      '[data-testid="reset-page"]',
      '#email',
      '[data-testid="reset-submit"]',
    ].map((s) => {
      const rect = document.querySelector(s).getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }),
  );
}
async function observeSendMotion(motion) {
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: motion },
    ],
  });
  await page.evaluate(() => {
    const original = Element.prototype.animate;
    const state = { original, calls: [] };
    window.__resetSendMotion = state;
    Element.prototype.animate = function (...args) {
      const animation = original.apply(this, args);
      if (this.matches('[data-testid="reset-send-icon"]')) {
        const timing = animation.effect.getTiming();
        const call = {
          duration: timing.duration,
          iterations: timing.iterations,
          fill: timing.fill,
          finished: false,
        };
        state.calls.push(call);
        animation.finished.then(
          () => {
            call.finished = true;
          },
          () => {
            call.cancelled = true;
          },
        );
      }
      return animation;
    };
  });
  return {
    async verify() {
      if (motion === 'no-preference')
        await page.waitForFunction(() =>
          window.__resetSendMotion.calls.some((call) => call.finished),
        );
      assert.deepEqual(
        await page.evaluate(() => window.__resetSendMotion.calls),
        motion === 'reduce'
          ? []
          : [{ duration: 240, iterations: 1, fill: 'auto', finished: true }],
        'Send animates once for 240ms, resets naturally, and respects reduced motion',
      );
      assert.equal(
        await page.evaluate(() => {
          const icon = document.querySelector(
            '[data-testid="reset-send-icon"]',
          );
          return getComputedStyle(icon).transform;
        }),
        'none',
        'The send icon returns to its original position while the request remains pending',
      );
    },
    async dispose() {
      await page.evaluate(() => {
        Element.prototype.animate = window.__resetSendMotion.original;
        delete window.__resetSendMotion;
      });
    },
  };
}
async function submit({
  hold = false,
  lose = false,
  expected = 'accepted',
  motion = 'reduce',
} = {}) {
  const values = await page.evaluate(() => ({
    email: document.querySelector('#email')?.value,
    password: document.querySelector('#newPassword')?.value,
    confirmation: document.querySelector('#confirmPassword')?.value,
  }));
  // Native Better Auth throttles applications to three per minute. Preserve the
  // real UI wait and explicitly retry only after the actual server window.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const observed = await observePasswordReset(page, { hold, lose });
    const form =
      hold && values.email !== undefined
        ? await requestFormGeometry()
        : undefined;
    const sendMotion = form ? await observeSendMotion(motion) : undefined;
    try {
      await activate('submit');
      const result = await observed.settled();
      report.requests.push(...result.responses);
      if (hold) {
        await state('pending');
        assert.equal(
          await page.evaluate(
            (s) => document.querySelector(s).disabled,
            selector('submit'),
          ),
          true,
          'Pending real request disables duplicate submission',
        );
        if (values.email === undefined)
          assert.equal(
            await page.evaluate(() =>
              ['#newPassword', '#confirmPassword'].every(
                (s) => document.querySelector(s).disabled,
              ),
            ),
            true,
            'The actual reset request disables both password fields',
          );
        else {
          assert.deepEqual(
            await page.evaluate(() => ({
              value: document.querySelector('#email')?.value,
              disabled: document.querySelector('#email')?.disabled,
            })),
            { value: values.email, disabled: true },
            'Request pending keeps the original email field and disables it',
          );
          const pendingForm = await requestFormGeometry();
          for (let i = 0; i < form.length; i++)
            for (const key of ['x', 'y', 'width', 'height'])
              assert.ok(
                Math.abs(pendingForm[i][key] - form[i][key]) <= 0.5,
                `Pending preserves form/email/button ${key}`,
              );
          assert.deepEqual(
            await page.evaluate(() => {
              const icon = document.querySelector(
                '[data-testid="reset-send-icon"] svg',
              );
              const rect = icon?.getBoundingClientRect();
              return {
                send: icon?.classList.contains('lucide-send'),
                width: rect?.width,
                height: rect?.height,
              };
            }),
            { send: true, width: 18, height: 18 },
            'The pending submit keeps its approved 18px Send icon',
          );
          await sendMotion.verify();
        }
        await page.keyboard.press('Enter');
        assert.equal(
          (await observed.observed()).requests.length,
          1,
          'Enter while pending sends no duplicate request',
        );
        await representativeStates(
          values.email === undefined ? 'reset-pending' : 'request-pending',
          values.email === undefined ? 1440 : 1920,
        );
        if (sendMotion) await sendMotion.verify();
        await observed.release();
      }
      if (result.responses.at(-1).status === 429) {
        const limited = result.responses.at(-1);
        assert.ok(limited.retryAfter > 0 && limited.retryAfter <= 60);
        report.rateLimits.push(limited);
        await state('rate-limited');
        await representativeStates('rate-limited', 1920);
        await page.waitForFunction(
          (s) => {
            const control = document.querySelector(s);
            return (
              control &&
              !control.disabled &&
              control.getAttribute('aria-disabled') !== 'true'
            );
          },
          selector('reapply'),
          { timeout: 65000 },
        );
        await activate('reapply');
        await state('form');
        if (values.email !== undefined) await page.fill('#email', values.email);
        if (values.password !== undefined)
          await fillPasswords(values.password, values.confirmation);
        assert.ok(
          attempt < 3,
          'Real recovery limiter eventually permits the explicit retry',
        );
        continue;
      }
      await state(lose ? 'unknown' : expected);
      assert.equal(
        (await observed.observed()).requests.length,
        1,
        'A settled or unknown operation does not automatically repeat a real mutation',
      );
      return result.responses.at(-1);
    } finally {
      try {
        if (sendMotion) await sendMotion.dispose();
      } finally {
        await observed.dispose();
      }
    }
  }
}
async function apply(email = config.credentials.email, options) {
  await open();
  await state('form');
  await page.fill('#email', email);
  return submit(options);
}
async function land(url) {
  await page.goto(url);
  await state('form');
  const actual = new URL(await page.url());
  assert.equal(actual.pathname, '/reset-password');
  assert.ok(actual.searchParams.has('token'));
  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => entry.name),
  );
  assert.ok(
    resources.every((url) => new URL(url).origin === config.origin),
    'The real token landing page loads no third-party resources',
  );
  assert.equal(
    JSON.parse((await page.fetch('/api/auth/get-session')).body),
    null,
    'Email recovery is anonymous and does not require sign-in',
  );
}
async function fillPasswords(password, confirmation = password) {
  await page.fill('#newPassword', password);
  await page.fill('#confirmPassword', confirmation);
}
async function requestHttp(path, body, cookie) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(`${config.origin}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Origin: config.origin,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (response.status !== 429) return response;
    const seconds = Number(response.headers.get('x-retry-after'));
    assert.ok(seconds > 0 && seconds <= 60);
    report.rateLimits.push({
      path,
      source: 'isolated-fixture-cleanup',
      retryAfter: seconds,
    });
    await response.arrayBuffer();
    assert.ok(attempt < 3);
    await delay(seconds * 1000);
  }
}
let cookie;
async function configure(name = 'accepted') {
  if (!cookie) {
    const auth = await requestHttp(
      '/api/auth/sign-in/email',
      config.credentials,
    );
    assert.equal(
      auth.status,
      200,
      'Independent owner session configures only the isolated runtime',
    );
    cookie = auth.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    privateValues.push(cookie);
    await auth.arrayBuffer();
  }
  const response = await fetch(`${config.origin}/api/settings/smtp`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      Origin: config.origin,
      Cookie: cookie,
    },
    body: JSON.stringify({
      ...fixture.targets[name],
      username: '',
      fromName: 'Ariso 密码恢复验证',
      fromEmail: 'recovery@example.test',
    }),
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(
    response.status,
    200,
    'Real SMTP settings persist in the disposable database',
  );
  await response.arrayBuffer();
}
const sql = (statement) => identitySql(config, statement);
const phase = (name) =>
  !config.passwordResetPhase || config.passwordResetPhase === name;
let failure;
let changedPassword = false;
try {
  assert.equal(
    (await sql('SELECT count(*) AS count FROM identity_smtp_settings'))[0]
      .count,
    0,
    'Recovery starts before SMTP configuration in the default runtime',
  );
  await open();
  const signedOut = await page.fetch('/api/auth/sign-out', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(signedOut.status, 200);
  await open('/login');
  await page.waitForSelector('#email');
  for (const width of [1920, 390]) {
    await resizeViewport(page, width, width === 1920 ? 960 : 844);
    const links = await page.evaluate(() =>
      [...document.querySelectorAll('a[href="/forgot-password"]')]
        .filter((node) => node.getClientRects().length)
        .map((node) => node.dataset.testid),
    );
    assert.deepEqual(links, [
      width === 390 ? 'login-forgot-mobile' : 'login-forgot-desktop',
    ]);
  }
  if (phase('representative')) await representativeStates('login', 1920);
  const entry = await page.evaluate(
    () =>
      [...document.querySelectorAll('a[href="/forgot-password"]')].find(
        (node) => node.getClientRects().length,
      ).dataset.testid,
  );
  await page.click(`[data-testid="${entry}"]`);
  await state('unconfigured');
  assert.equal(
    await page.evaluate(() => !!document.querySelector('#email')),
    false,
    'Unconfigured anonymous page does not pretend to send mail',
  );
  if (phase('representative')) await matrix('unconfigured', 1920);
  await open('/forgot-password?view=cli');
  await state('unconfigured');
  assert.equal(new URL(await page.url()).pathname, '/forgot-password');
  await open('/reset-password');
  await state('invalid');
  if (phase('representative')) await matrix('missing-token');
  await configure();
  await open('/forgot-password?view=cli');
  await state('form');
  assert.equal(new URL(await page.url()).pathname, '/forgot-password');
  assert.equal(
    await page.evaluate(() => document.querySelector('#email').value),
    '',
    'Anonymous form never discloses owner email',
  );
  if (phase('representative')) await matrix('request-form', 1920);
  if (phase('interactions')) {
    await page.fill('#email', 'invalid-email');
    await activate('submit');
    await page.waitForSelector('#email[aria-invalid="true"]');
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'email',
      'Invalid address receives keyboard focus',
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelector('#recovery-heading').textContent,
      ),
      '检查邮箱地址',
      'Email validation uses its approved feedback state',
    );
    await representativeStates('email-error', 1920);
  }
  if (phase('representative') || phase('interactions')) {
    await page.fill('#email', config.credentials.email);
    const accepted = await submit({
      hold: phase('interactions'),
      motion: 'no-preference',
    });
    assert.equal(accepted.status, 200);
    await representativeStates('accepted', 1920);
    await acceptedTips();
    const acceptedText = await page.evaluate(
      () => document.querySelector('[data-testid="reset-page"]').textContent,
    );
    const mailUrl = await latestMail();
    await land(mailUrl);
    if (phase('representative')) await matrix('new-password');
    if (phase('interactions')) {
      const visibilityPassword = 'Password-visibility-check';
      privateValues.push(visibilityPassword);
      await fillPasswords(visibilityPassword);
      for (const [name, label] of [
        ['newPassword', '新密码'],
        ['confirmPassword', '确认新密码'],
      ]) {
        for (const [action, type] of [
          ['显示', 'text'],
          ['隐藏', 'password'],
        ]) {
          await page.focus(`button[aria-label="${action}${label}"]`);
          await page.keyboard.press('Enter');
          await page.waitForFunction(
            ({ name, type }) => document.getElementById(name).type === type,
            { name, type },
          );
          assert.equal(
            await page.evaluate(
              (name) => document.getElementById(name).value,
              name,
            ),
            visibilityPassword,
            'Keyboard visibility toggles preserve the typed password',
          );
        }
      }
      await fillPasswords('short', 'different');
      await activate('submit');
      await page.waitForSelector('#newPassword[aria-invalid="true"]');
      assert.equal(
        await page.evaluate(() => document.activeElement?.id),
        'newPassword',
      );
      await representativeStates('password-error');
      await fillPasswords('Valid-password-for-confirmation', 'different');
      await activate('submit');
      await page.waitForSelector('#confirmPassword[aria-invalid="true"]');
      assert.equal(
        await page.evaluate(() => document.activeElement?.id),
        'confirmPassword',
      );
      assert.equal(
        await page.evaluate(
          () => document.querySelector('[role="alert"]').textContent,
        ),
        '两次输入的密码不一致，请修改后重试。',
        'Confirmation validation presents the approved summary and field error',
      );
      await representativeStates('confirmation-error');
    }
    // Keep the fixture owner's original password so later default suites can
    // still use their existing credentials; this is a real reset and revocation.
    await fillPasswords(config.credentials.password);
    const reset = await submit({
      hold: phase('interactions'),
      expected: 'success',
    });
    assert.equal(reset.status, 200);
    await representativeStates('success');
    assert.equal(
      (await sql('SELECT count(*) AS count FROM session'))[0].count,
      0,
      'Successful real reset deletes every old session',
    );
    const oldSession = await fetch(`${config.origin}/api/account`, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(
      oldSession.status,
      401,
      'The independent pre-reset owner Cookie is invalid',
    );
    await oldSession.arrayBuffer();
    cookie = undefined;
    assert.equal(
      JSON.parse((await page.fetch('/api/auth/get-session')).body),
      null,
      'Success never automatically signs the browser in',
    );
    await activate('login');
    await page.waitForSelector('#email');
    assert.equal(new URL(await page.url()).pathname, '/login');
    await page.goto(mailUrl);
    await state('invalid');
    await representativeStates('consumed-token');
    await activate('reapply');
    await state('form');
    if (phase('interactions')) {
      const before = (await messages()).accepted.length;
      await page.fill('#email', 'absent-owner@example.test');
      assert.equal(
        (await submit({ hold: true, motion: 'reduce' })).status,
        200,
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('[data-testid="reset-page"]').textContent,
        ),
        acceptedText,
        'Known and nonexistent email receive exactly the same generic UI',
      );
      assert.equal(
        (await messages()).accepted.length,
        before,
        'Unknown email does not send recovery mail',
      );
      report.checks.push(
        'Real held requests preserve form/email/button geometry and disabled email, prevent duplicate submission, retain 18px Send, animate once for 240ms and skip motion when reduced.',
      );
      await activate('reapply');
      await state('form');
      await page.fill('#email', config.credentials.email);
      assert.equal((await submit()).status, 200);
      await land(await latestMail());
      await fillPasswords(config.credentials.password);
      const navigation = await observePasswordReset(page, { hold: true });
      try {
        await activate('submit');
        await state('pending');
        const navigationResult = await navigation.settled();
        report.requests.push(...navigationResult.responses);
        assert.equal(navigationResult.responses[0].status, 200);
        await page.click('header a[href="/"]');
        await page.waitForSelector('#home-heading');
        assert.equal(new URL(await page.url()).pathname, '/');
        await navigation.release();
        await navigation.read();
        assert.deepEqual(
          await page.evaluate(() => ({
            pathname: location.pathname,
            home: !!document.querySelector('#home-heading'),
            reset: !!document.querySelector('[data-testid="reset-page"]'),
          })),
          { pathname: '/', home: true, reset: false },
          'A completed reset response cannot change the page after navigating home',
        );
        assert.equal((await navigation.observed()).requests.length, 1);
      } finally {
        await navigation.dispose();
      }
    }
    report.checks.push(
      'Login entry, anonymous real receipt, current publicUrl, native callback, validation, success, every old session, no auto-login, one-use replay and reapply.',
    );
  }
  if (phase('recovery')) {
    await apply();
    const expiredMail = await latestMail();
    await sql(
      "UPDATE verification SET expires_at = 1 WHERE identifier LIKE 'reset-password:%'",
    );
    await page.goto(expiredMail);
    await state('invalid');
    await representativeStates('expired-token');
    await activate('reapply');
    await state('form');
    await configure('failed');
    assert.equal(
      (await apply(config.credentials.email, { expected: 'error' })).code,
      'RESET_EMAIL_DELIVERY_FAILED',
    );
    await representativeStates('delivery-failed', 1920);
    await configure('unknown');
    assert.equal(
      (await apply(config.credentials.email, { expected: 'unknown' })).code,
      'RESET_EMAIL_DELIVERY_UNKNOWN',
    );
    await representativeStates('delivery-unknown', 1920);
    await configure();
    await apply(config.credentials.email, { lose: true });
    await representativeStates('request-response-unknown', 1920);
    const unknownMail = await latestMail();
    await land(unknownMail);
    const beforePassword = (
      await sql("SELECT password FROM account WHERE provider_id='credential'")
    )[0].password;
    await sql(
      "CREATE TRIGGER reject_browser_reset_write BEFORE UPDATE OF password ON account BEGIN SELECT RAISE(ABORT, 'injected browser reset password write failure'); END",
    );
    try {
      await fillPasswords(config.credentials.password);
      assert.equal((await submit({ expected: 'unknown' })).status, 500);
      await representativeStates('consumed-write-failure');
      assert.equal(
        (
          await sql(
            "SELECT password FROM account WHERE provider_id='credential'",
          )
        )[0].password,
        beforePassword,
        'Real injected write failure leaves this credential unchanged',
      );
    } finally {
      await sql('DROP TRIGGER reject_browser_reset_write');
    }
    await page.goto(unknownMail);
    await state('invalid');
    await activate('reapply');
    await state('form');
    await apply();
    await land(await latestMail());
    const password = `Recovery-${randomBytes(20).toString('hex')}`;
    privateValues.push(password);
    await fillPasswords(password);
    changedPassword = true;
    const response = await submit({ lose: true });
    assert.equal(
      response.status,
      200,
      'The lost response followed a real successful password commit',
    );
    cookie = undefined;
    await representativeStates('reset-response-unknown');
    assert.equal(
      (await sql('SELECT count(*) AS count FROM session'))[0].count,
      0,
      'Lost reset response still revoked real sessions',
    );
    await activate('reapply');
    await state('form');
    report.checks.push(
      'Expired callback, actual SMTP 550 and DATA disconnect, consumed-token SQLite password-write failure, real request/reset lost responses, unknown result never retried, reapply stays in email recovery.',
    );
  }
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = sanitize(error.stack ?? error);
  try {
    await page.screenshot({
      path: join(config.output, 'password-reset-failure.png'),
    });
  } catch (captureError) {
    report.captureError = sanitize(captureError.stack ?? captureError);
  }
} finally {
  try {
    if (changedPassword) {
      // Do not replay the uncertain mutation. Obtain a fresh token from the
      // actual delivered mail and restore only the disposable owner's password.
      const request = await requestHttp('/api/auth/request-password-reset', {
        email: config.credentials.email,
      });
      assert.equal(
        request.status,
        200,
        'Cleanup requests a fresh recovery token',
      );
      await request.arrayBuffer();
      const mail = await latestMail();
      const token = new URL(mail).pathname.split('/').at(-1);
      const reset = await requestHttp('/api/auth/reset-password', {
        token,
        newPassword: config.credentials.password,
      });
      assert.equal(
        reset.status,
        200,
        'Disposable credentials are restored through the real recovery contract',
      );
      await reset.arrayBuffer();
    }
    await sql('DELETE FROM identity_smtp_settings');
    await open('/login');
  } catch (error) {
    report.status = 'failed';
    report.cleanupError = sanitize(error.stack ?? error);
    failure ??= error;
  }
  await writeFile(
    join(config.output, 'password-reset.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw new Error(sanitize(failure.stack ?? failure));
console.log(
  JSON.stringify({
    status: report.status,
    phase: report.phase,
    checks: report.checks.length,
    screenshots: report.screenshots.length,
  }),
);
