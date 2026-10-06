/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { unexpectedSharingErrors } = await import(config.sharingErrorsScript);
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { resizeViewport, setTheme, readGeometry, assertGeometry } = await import(
  config.geometryScript
);
const { verifyShortEmpty, waitForSharingScrollStable } = await import(
  new URL('./sharing-public-feedback.mjs', config.sharingErrorsScript).href
);
const { installBrowserErrors, readBrowserErrors } = await import(
  config.errorsScript
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const sql = (statement) => identitySql(config, statement);
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  phase: config.sharingPublicPhase ?? 'full',
  scope: 'production anonymous sharing page, cropped DTO and refresh',
  checks: [],
  layouts: [],
  limitations: [
    'Physical phones, software keyboards, nonzero safe area and Release containers were not exercised. Anonymous lightbox belongs to T-SHR-04.',
  ],
};
const path = (key) => `/s/${config.albums[key].token}`;
const publicPath = path('public');
const record = (scenario, detail = {}) =>
  report.checks.push({ scenario, ...detail });
const forbiddenFields = [
  'originalName',
  'tags',
  'uploadedAt',
  'createdAt',
  'storageId',
  'storageName',
  'storageKey',
  'key',
  'exif',
  'gps',
  'metadata',
  'byteSize',
  'width',
  'height',
  'format',
  'mime',
];
let errorScript;
let backgroundPage;

function assertCropped(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, field] of Object.entries(value)) {
    assert.equal(
      forbiddenFields.includes(key),
      false,
      `Anonymous DTO excludes ${key}`,
    );
    assertCropped(field);
  }
}
function json(response) {
  return JSON.parse(response.body);
}
async function loaded(count) {
  await page.waitForFunction(
    (count) =>
      Number(
        document
          .querySelector('[data-testid="share-items"]')
          ?.getAttribute('data-share-loaded-count'),
      ) === count,
    count,
  );
}
async function open(key = 'public') {
  await page.goto(`${config.origin}${path(key)}`);
  await page.waitForSelector(
    '[data-testid="share-items"], [data-testid="share-state"], [data-testid="share-empty"]',
  );
}
async function ensureVisible() {
  await task.cdp('Target.activateTarget', { targetId: page.targetId });
  await page.waitForFunction(() => !document.hidden);
}
async function hidePage() {
  if (!backgroundPage) {
    backgroundPage = await task.newPage();
    await backgroundPage.goto(`${config.origin}/api/health`);
  }
  await page.evaluate(() => {
    if (!window.__shareVisibilityRecorder) {
      window.__shareVisibilityRecorder = () =>
        window.__shareVisibility.push({
          hidden: document.hidden,
          at: Date.now(),
        });
      document.addEventListener(
        'visibilitychange',
        window.__shareVisibilityRecorder,
        { capture: true },
      );
    }
    window.__shareVisibility = [];
  });
  await task.cdp('Target.activateTarget', {
    targetId: backgroundPage.targetId,
  });
  // Ego Page observation activates the observed tab. Keep all hidden-period
  // observation on the foreground page, then inspect native events on resume.
  await backgroundPage.waitForFunction(() => !document.hidden);
}
async function capture(name, widths = [1440, 390], themes = ['light', 'dark']) {
  const help =
    name === 'password-help' || name === 'authorization-expired-help';
  if (name === 'check-failed') {
    await page.mouse.move(200, 300);
    await page.mouse.wheel(0, -100000, {
      label: 'show the album check feedback',
    });
    await waitForPaint();
  }
  for (const width of widths) {
    await resizeViewport(page, width);
    for (const theme of themes) {
      await setTheme(page, theme);
      await page.waitForFunction((width) => {
        const gallery = document.querySelector('[data-testid="share-items"]');
        return (
          !gallery ||
          Number(gallery.getAttribute('data-columns')) ===
            (width >= 1200 ? 4 : width >= 768 ? 3 : 2)
        );
      }, width);
      const geometry = await readGeometry(page);
      assertGeometry(geometry, `${name} ${theme} ${width}`);
      if (name === 'first-read-failed') {
        const retryWidth = await page.evaluate(() => {
          const button = document.querySelector('[data-testid="share-retry"]');
          return {
            button: button.getBoundingClientRect().width,
            content: button.parentElement.getBoundingClientRect().width,
          };
        });
        assert.equal(
          retryWidth.button,
          retryWidth.content,
          'Dependency retry fills the designed card content width',
        );
      }
      assert.ok(geometry.targets.length > 0, 'The public home exit is visible');
      for (const target of geometry.targets)
        assert.ok(
          target.width >= 44 && target.height >= 44,
          `${name} ${theme} ${width}: ${target.name} keeps a 44px target`,
        );
      const passwordControl = await page.evaluate(() => {
        const input = document.querySelector(
          '[data-testid="share-password-input"]',
        );
        if (!input) return null;
        const form = input.closest('form');
        const group = input.closest('[data-slot="input-group"]');
        const lock = group?.querySelector(
          '[data-slot="input-group-prefix"] .lucide-lock-keyhole',
        );
        const tip = form.querySelector('button[aria-label="查看访问说明"]');
        const info = tip?.querySelector('.lucide-info');
        return {
          label: [...input.labels].map((label) => label.textContent.trim()),
          grouped: !!group,
          lock: lock
            ? {
                width: lock.getBoundingClientRect().width,
                height: lock.getBoundingClientRect().height,
                hidden: lock.getAttribute('aria-hidden'),
              }
            : null,
          tipType: tip?.type,
          info: info
            ? {
                width: info.getBoundingClientRect().width,
                height: info.getBoundingClientRect().height,
                marginLeft: getComputedStyle(info).marginLeft,
                marginRight: getComputedStyle(info).marginRight,
              }
            : null,
          inlineHelp: form.textContent.replace(/\s/g, '').includes('24小时'),
        };
      });
      if (passwordControl) {
        assert.deepEqual(passwordControl.label, ['分享密码']);
        assert.equal(passwordControl.grouped, true);
        assert.deepEqual(passwordControl.lock, {
          width: 16,
          height: 16,
          hidden: 'true',
        });
        assert.equal(passwordControl.tipType, 'button');
        assert.deepEqual(passwordControl.info, {
          width: 16,
          height: 16,
          marginLeft: '0px',
          marginRight: '0px',
        });
        assert.equal(
          passwordControl.inlineHelp,
          false,
          'Ordinary access help is disclosed by Tips rather than repeated in the form',
        );
      }
      const emptyState = await page.evaluate(() => {
        const empty = document.querySelector('[data-testid="share-empty"]');
        if (!empty) return null;
        const icon = empty.querySelector('.lucide-images');
        const text = empty.querySelector('p');
        const rect = empty.getBoundingClientRect();
        const iconRect = icon?.getBoundingClientRect();
        const textRect = text?.getBoundingClientRect();
        return {
          component: empty.getAttribute('data-slot'),
          role: empty.getAttribute('role'),
          headings: empty.querySelectorAll('h1,h2,h3').length,
          text: text?.textContent.trim(),
          fontSize: text ? getComputedStyle(text).fontSize : null,
          lineHeight: text ? getComputedStyle(text).lineHeight : null,
          icon: iconRect
            ? {
                width: iconRect.width,
                height: iconRect.height,
                hidden: icon.getAttribute('aria-hidden'),
              }
            : null,
          occurrences:
            document.querySelector('main').textContent.split('暂无可展示的图片')
              .length - 1,
          zeroCount:
            document
              .querySelector('[data-share-scroll] header p:last-child')
              ?.textContent.replace(/\s/g, '') === '0张图片',
          centered:
            iconRect && textRect
              ? {
                  horizontal:
                    (iconRect.left + iconRect.right - rect.left - rect.right) /
                    2,
                  vertical:
                    (iconRect.top + textRect.bottom - rect.top - rect.bottom) /
                    2,
                }
              : null,
        };
      });
      if (emptyState) {
        assert.equal(emptyState.component, 'empty-state');
        assert.equal(emptyState.role, 'status');
        assert.equal(emptyState.headings, 0);
        assert.equal(emptyState.text, '暂无可展示的图片');
        assert.equal(emptyState.fontSize, '14px');
        assert.equal(emptyState.lineHeight, '22px');
        assert.deepEqual(emptyState.icon, {
          width: 36,
          height: 36,
          hidden: 'true',
        });
        assert.equal(emptyState.occurrences, 1);
        assert.equal(emptyState.zeroCount, true);
        assert.ok(
          Math.abs(emptyState.centered.horizontal) <= 1 &&
            Math.abs(emptyState.centered.vertical) <= 1,
          'The compact empty icon and text are centered within the preserved container',
        );
      }
      const sharingGeometry = await page.evaluate(() => {
        const scroller = document.querySelector('[data-share-scroll]');
        if (!scroller) return null;
        const gallery = document.querySelector('[data-testid="share-items"]');
        return {
          contentWidth:
            scroller.clientWidth -
            parseFloat(getComputedStyle(scroller).paddingLeft) -
            parseFloat(getComputedStyle(scroller).paddingRight),
          galleryWidth: gallery?.getBoundingClientRect().width,
          columns: Number(gallery?.getAttribute('data-columns')),
        };
      });
      if (sharingGeometry) {
        const expectedWidth =
          Math.min(width, 1192) - (width >= 768 && width < 1200 ? 48 : 32);
        assert.equal(
          sharingGeometry.contentWidth,
          expectedWidth,
          'Share content keeps the approved width regardless of its text length',
        );
        if (sharingGeometry.galleryWidth !== undefined) {
          assert.equal(sharingGeometry.galleryWidth, expectedWidth);
          assert.equal(
            sharingGeometry.columns,
            width >= 1200 ? 4 : width >= 768 ? 3 : 2,
          );
        }
      }
      const recoveryState = await page.evaluate(() => {
        const state = document.querySelector(
          '[data-testid="share-empty"], [data-testid="share-cursor-invalid"]',
        );
        return state ? state.getBoundingClientRect().height : null;
      });
      if (recoveryState !== null)
        assert.equal(recoveryState, width >= 768 ? 280 : 220);
      let helpGeometry;
      if (help) {
        await page.click('button[aria-label="查看访问说明"]');
        await page.waitForSelector('[role="dialog"][aria-label="访问说明"]');
        helpGeometry = await page.evaluate(() => {
          const dialog = document.querySelector(
            '[role="dialog"][aria-label="访问说明"]',
          );
          const rect = dialog.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            viewportHeight: innerHeight,
            text: dialog.textContent.replace(/\s/g, ''),
          };
        });
        assert.ok(
          helpGeometry.left >= 0 &&
            helpGeometry.right <= width &&
            helpGeometry.top >= 0 &&
            helpGeometry.bottom <= helpGeometry.viewportHeight,
          'Access Tips fit the real viewport',
        );
        assert.ok(
          helpGeometry.text.includes('24小时') &&
            /关闭/.test(helpGeometry.text) &&
            /改密|修改密码/.test(helpGeometry.text) &&
            /到期/.test(helpGeometry.text),
        );
      }
      const screenshot = join(
        config.output,
        `sharing-public-${name}-${theme}-${width}.png`,
      );
      await page.screenshot({ path: screenshot });
      report.layouts.push({
        state: name,
        theme,
        width,
        height: width >= 1200 ? 1080 : 844,
        screenshot: screenshot.slice(config.output.length + 1),
        geometry,
        sharingGeometry,
        recoveryStateHeight: recoveryState,
        passwordControl,
        emptyState,
        ...(help
          ? {
              helpGeometry,
              geometryContext: 'Underlying form before access Tips open',
            }
          : {}),
      });
      if (help) {
        await page.keyboard.press('Escape');
        await page.waitForSelector('[role="dialog"][aria-label="访问说明"]', {
          state: 'hidden',
        });
        assert.equal(
          await page.evaluate(() =>
            document.activeElement?.getAttribute('aria-label'),
          ),
          '查看访问说明',
        );
      }
    }
  }
}
async function hiddenNames() {
  const state = await page.evaluate((names) => {
    const attributes = [
      ...document.querySelectorAll('[alt],[title],[aria-label]'),
    ].flatMap((node) =>
      ['alt', 'title', 'aria-label'].map(
        (name) => node.getAttribute(name) ?? '',
      ),
    );
    const text = document.querySelector('main').textContent;
    return {
      names: names.filter(
        (name) =>
          text.includes(name) ||
          attributes.some((value) => value.includes(name)),
      ),
      injected: window.__shareInjection === true,
    };
  }, config.names);
  assert.deepEqual(state, { names: [], injected: false });
}
async function traffic() {
  return page.evaluate(() => window.__shareTraffic ?? []);
}
async function instrument() {
  await page.evaluate(() => {
    const original = window.fetch;
    window.__shareTraffic = [];
    window.__shareInstrumentedAt = Date.now();
    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : args[0].url;
      if (!url.includes('/items') && !url.includes('/refresh'))
        return original(...args);
      const entry = {
        url,
        body: args[1]?.body ? JSON.parse(args[1].body) : undefined,
        startedAt: Date.now(),
        hidden: document.hidden,
      };
      window.__shareTraffic.push(entry);
      try {
        const response = await original(...args);
        entry.status = response.status;
        entry.response = await response.clone().json();
        entry.finishedAt = Date.now();
        return response;
      } catch (error) {
        entry.error = String(error);
        entry.finishedAt = Date.now();
        throw error;
      }
    };
  });
}
async function awaitRefresh(after = 0) {
  await page.waitForFunction(
    (after) =>
      (window.__shareTraffic ?? []).filter(
        (entry) => entry.url.includes('/refresh') && entry.finishedAt,
      ).length > after,
    after,
    { timeout: 15000 },
  );
}
async function updateShare(values) {
  const assignments = Object.entries(values)
    .map(
      ([key, value]) =>
        `${key}=${typeof value === 'string' ? `'${value.replaceAll("'", "''")}'` : Number(value)}`,
    )
    .join(',');
  await sql(
    `UPDATE album_shares SET ${assignments} WHERE album_id='${config.albums.public.id}'`,
  );
}
async function waitForPaint() {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

async function passwordHelp(state) {
  const trigger = 'button[aria-label="查看访问说明"]';
  const dialog = '[role="dialog"][aria-label="访问说明"]';
  const url = await page.url();
  const initial = await page.evaluate(() => ({
    value: document.querySelector('[data-testid="share-password-input"]').value,
    width: innerWidth,
    height: innerHeight,
    theme: document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light',
  }));
  const preservedInput = '  access tips preserve this input  ';
  await page.fill('[data-testid="share-password-input"]', preservedInput);
  await page.evaluate(() => {
    const original = window.fetch;
    window.__shareHelpOriginalFetch = original;
    window.__shareHelpUnlocks = 0;
    window.__shareHelpSubmits = 0;
    window.__shareHelpSubmitRecord = () => window.__shareHelpSubmits++;
    document
      .querySelector('[data-testid="share-password-form"]')
      .addEventListener('submit', window.__shareHelpSubmitRecord, true);
    window.fetch = (...args) => {
      if (String(args[0]).endsWith('/unlock')) window.__shareHelpUnlocks++;
      return original(...args);
    };
  });
  try {
    await capture(`${state}-help`, [360, 390, 430, 768, 1440]);
    for (const { width, height, theme } of [
      { width: 1440, height: 1080, theme: 'light' },
      { width: 390, height: 420, theme: 'light' },
      { width: 390, height: 420, theme: 'dark' },
    ]) {
      await resizeViewport(page, width, height);
      await setTheme(page, theme);
      if (height === 420) {
        await page.mouse.move(195, 300);
        await page.mouse.wheel(0, -100000, {
          label: 'start the short password form at the top',
        });
        await page.waitForFunction(
          () =>
            document.scrollingElement.scrollTop +
              document.querySelector('main').scrollTop ===
            0,
        );
        await page.mouse.wheel(0, 600, {
          label: 'reach the password form actions in a short viewport',
        });
        await page.waitForFunction(() => {
          const rect = document
            .querySelector('[data-testid="share-password-submit"]')
            .getBoundingClientRect();
          return (
            document.scrollingElement.scrollTop +
              document.querySelector('main').scrollTop >
              0 &&
            rect.top >= 0 &&
            rect.bottom <= innerHeight
          );
        });
        const short = await page.evaluate(() => {
          const rect = document
            .querySelector('[data-testid="share-password-submit"]')
            .getBoundingClientRect();
          return {
            scroll:
              document.scrollingElement.scrollTop +
              document.querySelector('main').scrollTop,
            top: rect.top,
            bottom: rect.bottom,
            viewport: innerHeight,
          };
        });
        assert.ok(short.scroll > 0, 'The short password page actually scrolls');
        assert.ok(
          short.top >= 0 && short.bottom <= short.viewport,
          'Real scrolling reaches the entire primary action',
        );
      }
      await page.click(
        '[data-testid="share-password-form"] [data-slot="input-group-prefix"]',
      );
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.getAttribute('data-testid'),
        ),
        'share-password-input',
        'Clicking the actual lock prefix focuses its InputGroup field',
      );
      await waitForSharingScrollStable(page);
      const scroll = await page.evaluate(
        () =>
          document.scrollingElement.scrollTop +
          document.querySelector('main').scrollTop,
      );
      const geometry = await readGeometry(page);
      assertGeometry(geometry, `${state} help ${theme} ${width}x${height}`);
      assert.ok(geometry.targets.length > 0);
      for (const target of geometry.targets)
        assert.ok(target.width >= 44 && target.height >= 44);
      for (const action of ['click', 'Enter', 'Space']) {
        if (action === 'click') await page.click(trigger);
        else {
          await page.focus('[data-testid="share-password-input"]');
          await page.keyboard.press('Shift+Tab');
          const focus = await page.evaluate(() => {
            const node = document.activeElement;
            const style = getComputedStyle(node);
            return {
              label: node.getAttribute('aria-label'),
              outlineWidth: style.outlineWidth,
              outlineStyle: style.outlineStyle,
              boxShadow: style.boxShadow,
            };
          });
          assert.equal(focus.label, '查看访问说明');
          assert.ok(
            (parseFloat(focus.outlineWidth) > 0 &&
              focus.outlineStyle !== 'none') ||
              focus.boxShadow !== 'none',
            'Keyboard access to Tips has a visible focus indicator',
          );
          await page.keyboard.press(action);
        }
        await page.waitForSelector(dialog);
        const help = await page.evaluate(() => {
          const node = document.querySelector(
            '[role="dialog"][aria-label="访问说明"]',
          );
          const rect = node.getBoundingClientRect();
          return {
            text: node.textContent.replace(/\s/g, ''),
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            viewport: innerHeight,
          };
        });
        assert.ok(
          help.text.includes('24小时') &&
            /关闭/.test(help.text) &&
            /改密|修改密码/.test(help.text) &&
            /到期/.test(help.text),
        );
        assert.ok(
          help.left >= 0 &&
            help.right <= width &&
            help.top >= 0 &&
            help.bottom <= help.viewport,
          'Access help remains fully reachable in the real viewport',
        );
        if (height === 420 && action === 'click') {
          const screenshot = `sharing-public-${state}-help-short-${theme}-390.png`;
          await page.screenshot({ path: join(config.output, screenshot) });
          report.layouts.push({
            state: `${state}-help-short`,
            width,
            height,
            theme,
            screenshot,
            geometry,
            geometryContext: 'Underlying form before access Tips open',
            helpGeometry: help,
          });
        }
        if (action === 'Space') await page.mouse.click(8, 80);
        else await page.keyboard.press('Escape');
        await page.waitForSelector(dialog, { state: 'hidden' });
        await page.waitForFunction(
          () =>
            document.activeElement?.getAttribute('aria-label') ===
            '查看访问说明',
        );
        await waitForSharingScrollStable(page);
        const unchanged = await page.evaluate(() => ({
          value: document.querySelector('[data-testid="share-password-input"]')
            .value,
          scroll:
            document.scrollingElement.scrollTop +
            document.querySelector('main').scrollTop,
          submits: window.__shareHelpSubmits,
          unlocks: window.__shareHelpUnlocks,
        }));
        assert.deepEqual(
          unchanged,
          { value: preservedInput, scroll, submits: 0, unlocks: 0 },
          'Tips dismissal preserves input and scroll without any submit or unlock request',
        );
        assert.equal(await page.url(), url);
      }
      record(
        `${state} access Tips support click, Enter/Space, Escape and outside dismissal with focus return and no submission`,
        { width, height, theme, scroll },
      );
    }
  } finally {
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      window.fetch = window.__shareHelpOriginalFetch;
      document
        .querySelector('[data-testid="share-password-form"]')
        .removeEventListener('submit', window.__shareHelpSubmitRecord, true);
      delete window.__shareHelpOriginalFetch;
      delete window.__shareHelpSubmitRecord;
      delete window.__shareHelpSubmits;
      delete window.__shareHelpUnlocks;
    });
    await resizeViewport(page, initial.width, initial.height);
    await setTheme(page, initial.theme);
    await page.fill('[data-testid="share-password-input"]', initial.value);
  }
}

async function gateAndRepresentatives() {
  report.stage = 'gate-and-representatives';
  await open('password');
  const protectedAlbum = config.albums.password;
  for (const headers of [{}, { RSC: '1' }]) {
    const html = await page.fetch(path('password'), { headers });
    assert.match(html.headers['cache-control'], /private.*no-store/);
    assert.equal(html.headers['referrer-policy'], 'no-referrer');
    for (const secret of [
      protectedAlbum.name,
      protectedAlbum.description,
      config.publicIds[6],
    ])
      assert.equal(
        html.body.includes(secret),
        false,
        'Locked HTML and RSC contain no album identity or members',
      );
  }
  assert.equal((await page.fetch(`${path('password')}/items`)).status, 401);
  const documentState = await page.evaluate(() => ({
    noindex: document.querySelector('meta[name="robots"]')?.content,
    referrer: document.querySelector('meta[name="referrer"]')?.content,
    text: document.querySelector('main').textContent,
  }));
  assert.match(documentState.noindex, /noindex/);
  assert.equal(documentState.text.includes(protectedAlbum.name), false);
  const owner = await page.fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(config.credentials),
  });
  assert.equal(owner.status, 200);
  assert.equal(
    json(await page.fetch('/api/auth/get-session')).user.email,
    config.credentials.email,
  );
  assert.equal(
    (await page.fetch(`${path('password')}/items`)).status,
    401,
    'Owner session cannot bypass share password',
  );
  const ownerPublic = json(await page.fetch(`${publicPath}/items`));
  assert.equal(ownerPublic.total, 124);
  assert.deepEqual(
    ownerPublic.items.map((item) => item.imageId),
    config.publicIds.slice(0, 40),
  );
  assertCropped(ownerPublic);
  assert.equal(
    (
      await page.fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
    ).status,
    200,
  );
  assert.equal(json(await page.fetch('/api/auth/get-session')), null);
  record(
    'Anonymous HTML/RSC gate, noindex and owner session preserving anonymous scope',
  );
  await capture('password', [360, 390, 430, 768, 1440]);
  await passwordHelp('password');
  await page.focus('[data-testid="share-password-input"]');
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    ),
    'share-password-submit',
  );
  const focusStyle = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement);
    return {
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
      boxShadow: style.boxShadow,
    };
  });
  assert.ok(
    (parseFloat(focusStyle.outlineWidth) > 0 &&
      focusStyle.outlineStyle !== 'none') ||
      focusStyle.boxShadow !== 'none',
    'Keyboard focus has a visible indicator',
  );
  record('Password submit has a visible keyboard focus indicator', focusStyle);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => !!document.querySelector('[aria-invalid="true"], [role="alert"]'),
  );
  record('Empty password and keyboard submit provide field feedback');
  await page.fill('[data-testid="share-password-input"]', 'x'.repeat(129));
  await page.click('[data-testid="share-password-submit"]');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-slot="field-error"]')
      ?.textContent.includes('128'),
  );
  record('Overlong password is rejected by the real form');
  await page.fill('[data-testid="share-password-input"]', 'wrong-password');
  await page.click('[data-testid="share-password-submit"]');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-slot="field-error"]')
      ?.textContent.includes('密码'),
  );
  assert.equal(
    await page.evaluate(() =>
      document.querySelector('[data-slot="field-error"]').textContent.trim(),
    ),
    '密码错误，请重试',
  );
  await capture('wrong-password');
  const long = await page.fetch(`${path('password')}/unlock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'x'.repeat(129) }),
  });
  assert.equal(long.status, 400);
  record('Wrong password UI and overlong password HTTP validation');
  await page.fill('[data-testid="share-password-input"]', config.password);
  await page.evaluate(() => {
    const original = window.fetch;
    window.__shareUnlockCalls = 0;
    window.fetch = async (...args) => {
      if (String(args[0]).endsWith('/unlock')) {
        window.__shareUnlockCalls++;
        const response = await original(...args);
        await new Promise((resolve) => {
          window.__releaseShareUnlock = resolve;
        });
        window.fetch = original;
        return response;
      }
      return original(...args);
    };
  });
  await page.click('[data-testid="share-password-submit"]');
  await page.waitForFunction(() => !!window.__releaseShareUnlock);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="share-password-submit"]')
          .disabled,
    ),
    true,
  );
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.__shareUnlockCalls), 1);
  await capture('unlocking', [390], ['light']);
  await page.evaluate(() => window.__releaseShareUnlock());
  await page.waitForSelector('[data-testid="share-items"]');
  assert.equal(new URL(await page.url()).pathname, path('password'));
  await page.reload();
  await page.waitForSelector('[data-testid="share-items"]');
  record('Real unlock persists grant and prevents duplicate submission');
  for (const key of ['disabled', 'expired']) {
    await open(key);
    const state = await page.evaluate(() => ({
      text: document.querySelector('main').textContent,
      cards: document.querySelectorAll('[data-share-item]').length,
    }));
    assert.equal(state.cards, 0);
    assert.equal(state.text.includes(config.albums[key].name), false);
    await capture(key);
  }
  await page.goto(`${config.origin}/s/nonexistent-share`);
  await page.waitForSelector('[data-testid="share-state"]');
  await capture('invalid');
  await open('empty');
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="share-empty"] p')
        ?.textContent.trim(),
    ),
    '暂无可展示的图片',
  );
  await capture('empty', [360, 390, 430, 768, 1440]);
  await verifyShortEmpty({ page, config, report });
  await open();
  await loaded(40);
  await hiddenNames();
  const response = await page.fetch(`${publicPath}/items`);
  const publicPage = json(response);
  assert.match(response.headers['cache-control'], /private.*no-store/);
  assert.equal(publicPage.total, 124);
  assert.deepEqual(
    publicPage.items.map((item) => item.imageId),
    config.publicIds.slice(0, 40),
  );
  assertCropped(publicPage);
  assert.equal(
    config.excludedIds.some((id) => response.body.includes(id)),
    false,
  );
  assert.equal(
    publicPage.items.some((item) => 'displayName' in item),
    false,
  );
  assert.equal(publicPage.cover.imageId, config.statusIds.pending);
  assert.equal(
    publicPage.cover.thumbnailUrl,
    null,
    'Fixed unreadable cover stays placeholder',
  );
  for (const [key, status] of [
    ['pending', 'processing'],
    ['processing', 'processing'],
    ['failed', 'failed'],
    ['disabled', 'disabled'],
  ])
    assert.equal(
      publicPage.items.find((item) => item.imageId === config.statusIds[key])
        .status,
      status,
    );
  assert.equal(
    publicPage.items.find(
      (item) => item.imageId === config.statusIds.reprocessFailed,
    ).status,
    'ready',
  );
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[data-share-item="${id}"]`)
        ?.textContent.includes('加载失败'),
    config.statusIds.missing,
  );
  record(
    'Cropped public DTO, pure text, fixed cover and processing/failed/disabled/thumbnail error placeholders',
  );
  await sql(
    `UPDATE albums SET preferred_cover_image_id='${config.statusIds.missing}' WHERE id='${config.albums.public.id}'`,
  );
  await open();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-share-cover]')
      .textContent.includes('图片加载失败'),
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-share-cover]').querySelectorAll('img')
          .length,
    ),
    0,
    'Eager cover errors use the same placeholder after hydration',
  );
  record(
    'A fixed cover with a missing published file recovers from an eager/pre-hydration error without another version',
  );
  await sql(
    `UPDATE albums SET preferred_cover_image_id='${config.statusIds.pending}' WHERE id='${config.albums.public.id}'`,
  );
  await open();
  await capture(
    'grid',
    config.sharingPublicPhase === 'representative'
      ? [1440, 390]
      : [360, 390, 430, 768, 1440],
  );
  await resizeViewport(page, 390, 420);
  const shortGeometry = await readGeometry(page);
  assertGeometry(shortGeometry, 'short mobile viewport');
  await page.click('[data-testid="share-load-more"]');
  await loaded(80);
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    const geometry = await readGeometry(page);
    assertGeometry(geometry, `short viewport ${theme}`);
    const screenshot = `sharing-public-short-${theme}-390.png`;
    await page.screenshot({ path: join(config.output, screenshot) });
    report.layouts.push({
      state: 'short',
      width: 390,
      height: 420,
      theme,
      screenshot,
      geometry,
    });
  }
  record('Short viewport scroll reaches the real load-more target', {
    geometry: shortGeometry,
  });
  await updateShare({ layout: 'masonry', show_name: 1 });
  await open();
  await page.waitForFunction(
    (name) => document.querySelector('main').textContent.includes(name),
    config.names[6],
  );
  await capture('masonry-names');
  await updateShare({ layout: 'grid', show_name: 0 });
}

async function behavior() {
  report.stage = 'pagination-refresh';
  await descriptionRecovery();
  await open();
  await loaded(40);
  await instrument();
  for (const count of [80, 120, 124]) {
    await page.click('[data-testid="share-load-more"]');
    await loaded(count);
  }
  const listRequests = (await traffic()).filter((entry) =>
    entry.url.includes('/items'),
  );
  assert.deepEqual(
    listRequests.map((entry) => entry.response.items.length),
    [40, 40, 4],
  );
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="share-load-more"]'),
    ),
    false,
  );
  await page.waitForFunction(
    (ids) => {
      const requests = (window.__shareTraffic ?? []).filter((entry) =>
        entry.url.includes('/refresh'),
      );
      return requests.some((first, index) => {
        const second = requests[index + 1];
        return (
          first.status === 200 &&
          first.finishedAt &&
          second?.status === 200 &&
          second.finishedAt &&
          first.body.ids.length === 80 &&
          second.body.ids.length === 44 &&
          new Set([...first.body.ids, ...second.body.ids]).size ===
            ids.length &&
          ids.every((id) =>
            [...first.body.ids, ...second.body.ids].includes(id),
          )
        );
      });
    },
    config.publicIds,
    { timeout: 15000 },
  );
  const refreshRequests = (await traffic()).filter((entry) =>
    entry.url.includes('/refresh'),
  );
  const fullCycleStart = refreshRequests.findIndex(
    (first, index) =>
      first.status === 200 &&
      first.finishedAt &&
      first.body.ids.length === 80 &&
      refreshRequests[index + 1]?.status === 200 &&
      refreshRequests[index + 1]?.finishedAt &&
      refreshRequests[index + 1]?.body.ids.length === 44,
  );
  const fullCycle = refreshRequests.slice(fullCycleStart, fullCycleStart + 2);
  record('Observed pagination refresh requests', {
    requests: refreshRequests.map((entry) => ({
      size: entry.body.ids.length,
      startedAt: entry.startedAt,
      hidden: entry.hidden,
      finishedAt: entry.finishedAt,
      status: entry.status,
      returned: entry.response?.items.length,
      total: entry.response?.total,
      showName: entry.response?.showName,
      layout: entry.response?.layout,
      error: entry.error,
    })),
  });
  assert.ok(refreshRequests.every((entry) => entry.body.ids.length <= 80));
  assert.ok(refreshRequests.some((entry) => entry.body.ids.length === 80));
  assert.ok(refreshRequests.some((entry) => entry.body.ids.length === 44));
  assert.deepEqual(
    [...new Set(fullCycle.flatMap((entry) => entry.body.ids))].sort(),
    [...config.publicIds].sort(),
  );
  assert.ok(
    fullCycle[1].startedAt >= fullCycle[0].finishedAt,
    'Refresh batches are sequential',
  );
  assert.ok(
    fullCycle[0].startedAt - listRequests.at(-1).finishedAt >= 4000,
    'Visible polling is scheduled at five seconds rather than continuous',
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-share-item]').length < 124,
    ),
    true,
    'Segmented rendering does not mount entire large album',
  );
  record(
    '40 member batches, ID deduplication and bounded 80+44 refresh with segmented rendering',
    {
      pageSizes: [40, 40, 4],
      refreshSizes: fullCycle.map((entry) => entry.body.ids.length),
    },
  );
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, -100000, {
    label: 'show the fully loaded summary',
  });
  await waitForPaint();
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('main')
        .textContent.includes('已显示全部 124 张图片'),
    ),
    true,
  );
  await capture('all-loaded');
  const hiddenCount = (await traffic()).filter((entry) =>
    entry.url.includes('/refresh'),
  ).length;
  await hidePage();
  await backgroundPage.waitForFunction(
    (until) => Date.now() >= until,
    Date.now() + 5500,
    { timeout: 10000 },
  );
  await ensureVisible();
  await awaitRefresh(hiddenCount);
  const visibility = await page.evaluate(() => window.__shareVisibility);
  assert.deepEqual(
    visibility.map((event) => event.hidden),
    [true, false],
  );
  const [hidden, visible] = visibility;
  assert.ok(
    visible.at - hidden.at >= 5500,
    'The actual document remained hidden',
  );
  const afterResume = (await traffic()).filter((entry) =>
    entry.url.includes('/refresh'),
  );
  assert.equal(
    afterResume.filter((entry) => entry.hidden).length,
    0,
    'Hidden visibility starts no new polling request',
  );
  const resumed = afterResume.find((entry) => entry.startedAt >= visible.at);
  assert.ok(resumed);
  assert.ok(
    resumed.startedAt - visible.at < 2000,
    'Visibility restoration checks immediately',
  );
  record(
    'Hidden visibility stops polling and resume immediately checks loaded members',
    {
      visibility: 'real browser tab activation and production requests',
      events: visibility,
    },
  );
  await sql(
    `UPDATE media_images SET visibility='private' WHERE id='${config.publicIds[10]}'`,
  );
  await sql(
    `UPDATE media_images SET trashed_at=${Date.now()} WHERE id='${config.publicIds[11]}'`,
  );
  await sql(
    `DELETE FROM album_images WHERE album_id='${config.albums.public.id}' AND image_id='${config.publicIds[12]}'`,
  );
  await sql(
    `UPDATE media_images SET processing_status='ready' WHERE id='${config.statusIds.pending}'`,
  );
  const previous = (await traffic()).filter(
    (entry) => entry.url.includes('/refresh') && entry.finishedAt,
  ).length;
  await ensureVisible();
  await awaitRefresh(previous);
  await loaded(121);
  for (const id of config.publicIds.slice(10, 13))
    assert.equal(
      await page.evaluate(
        (id) => !!document.querySelector(`[data-share-item="${id}"]`),
        id,
      ),
      false,
    );
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, -100000, { label: 'return to album start' });
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[data-share-item="${id}"]`)
        ?.getAttribute('data-share-status') === 'ready',
    config.statusIds.pending,
  );
  record(
    'Next refresh removes private/trashed/removed members and updates processing in the original position',
  );
  await capture('members-removed');
  await open();
  await loaded(40);
  await instrument();
  const first = json(await page.fetch(`${publicPath}/items`));
  await sql(
    `DELETE FROM album_images WHERE album_id='${config.albums.public.id}' AND image_id='${first.nextCursor}'`,
  );
  await page.click('[data-testid="share-load-more"]');
  await page.waitForSelector('[data-testid="share-refresh"]');
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="share-items"]'),
    ),
    false,
    'Invalid cursor uses the designed recovery state instead of old cards',
  );
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="share-load-error"]'),
    ),
    false,
    'Cursor recovery does not also claim that old gallery content is displayed',
  );
  await capture('invalid-cursor');
  await page.click('[data-testid="share-refresh"]');
  await loaded(40);
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="share-refresh"]'),
    ),
    false,
  );
  record(
    'Removed public anchor hides old cards and restores the real first page after explicit refresh',
  );
  await open('rateLimited');
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await page.fetch(`${path('rateLimited')}/unlock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password' }),
    });
    assert.equal(response.status, 401);
  }
  await page.fill('[data-testid="share-password-input"]', config.password);
  const started = Date.now();
  await page.click('[data-testid="share-password-submit"]');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="alert"]')].some((node) =>
      /稍后|等待|秒/.test(node.textContent),
    ),
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="share-password-submit"]')
          .disabled,
    ),
    true,
  );
  await capture('rate-limited');
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-testid="share-password-submit"]').disabled,
    undefined,
    { timeout: 65000 },
  );
  assert.ok(
    Date.now() - started >= 55000,
    'UI honors production Retry-After rather than a fake countdown',
  );
  await page.click('[data-testid="share-password-submit"]');
  await page.waitForSelector('[data-testid="share-items"]');
  record(
    'Production HTTP 429 countdown blocks retry until real limiter window and then unlock succeeds',
  );
  await recoveries();
}

async function descriptionRecovery() {
  const longDescription = '长'.repeat(2000);
  await sql(
    `UPDATE albums SET description='${longDescription}' WHERE id='${config.albums.public.id}'`,
  );
  await resizeViewport(page, 390);
  await open();
  await loaded(40);
  await page.waitForFunction(
    (description) =>
      document.querySelector('main').textContent.includes(description),
    longDescription,
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="share-items"]')
        .getBoundingClientRect().top > innerHeight,
  );
  await instrument();
  await awaitRefresh();
  await sql(
    `UPDATE albums SET description='' WHERE id='${config.albums.public.id}'`,
  );
  await page.waitForFunction(
    () => !document.querySelector('main').textContent.includes('长长长'),
    undefined,
    { timeout: 15000 },
  );
  await waitForPaint();
  const recovered = await page.evaluate(() => {
    const scroller = document.querySelector('[data-share-scroll]');
    const gallery = document.querySelector('[data-testid="share-items"]');
    const first = gallery.querySelector('[aria-posinset="1"]');
    const second = gallery.querySelector('[aria-posinset="2"]');
    return {
      scrollTop: scroller.scrollTop,
      galleryTop: gallery.getBoundingClientRect().top,
      firstTop: first?.getBoundingClientRect().top,
      secondTop: second?.getBoundingClientRect().top,
      viewportBottom: scroller.getBoundingClientRect().bottom,
    };
  });
  assert.equal(recovered.scrollTop, 0);
  assert.ok(recovered.galleryTop < recovered.viewportBottom);
  assert.equal(
    recovered.secondTop,
    recovered.firstTop,
    'The visible second column mounts after metadata moves the gallery, without scrolling',
  );
  record(
    'Long description clears on refresh and all visible gallery columns recover without a scroll event',
    recovered,
  );
  await sql(
    `UPDATE albums SET description='${config.albums.public.description.replaceAll("'", "''")}' WHERE id='${config.albums.public.id}'`,
  );
}

async function recoveries() {
  report.stage = 'recovery';
  await open();
  await loaded(40);
  await ensureVisible();
  const url = await page.url();
  await page.evaluate(() => {
    const original = window.fetch;
    window.__shareFailLoad = true;
    window.__shareFailCheck = false;
    window.__shareHoldCheck = false;
    window.__shareCheckReleases = [];
    window.fetch = (...args) => {
      if (String(args[0]).includes('/items') && window.__shareFailLoad) {
        window.__shareFailLoad = false;
        return Promise.resolve(
          new Response(
            JSON.stringify({ message: 'Injected list dependency failure' }),
            { status: 503 },
          ),
        );
      }
      if (String(args[0]).endsWith('/refresh') && window.__shareFailCheck)
        return Promise.resolve(
          new Response(
            JSON.stringify({ message: 'Injected check dependency failure' }),
            { status: 503 },
          ),
        );
      if (String(args[0]).endsWith('/refresh') && window.__shareHoldCheck)
        return original(...args).then(async (response) => {
          await new Promise((resolve) =>
            window.__shareCheckReleases.push(resolve),
          );
          return response;
        });
      return original(...args);
    };
  });
  await page.click('[data-testid="share-load-more"]');
  await page.waitForSelector('[data-testid="share-load-error"]');
  await loaded(40);
  await capture('load-failed');
  await page.click('[data-testid="share-load-more"]');
  await loaded(80);
  assert.equal(await page.url(), url);
  await page.evaluate(() => {
    window.__shareFailCheck = true;
  });
  await page.waitForSelector('[data-testid="share-refresh-error"]', {
    timeout: 15000,
  });
  await loaded(80);
  await capture('check-failed');
  await page.evaluate(() => {
    window.__shareHoldCheck = true;
    // Failed polling keeps the retry available until the real keyboard action.
    document.addEventListener(
      'keydown',
      (event) => {
        if (
          event.key === 'Enter' &&
          event.target.getAttribute('data-testid') === 'share-check-retry'
        )
          window.__shareFailCheck = false;
      },
      { capture: true, once: true },
    );
  });
  await page.focus('[data-testid="share-check-retry"]');
  await page.press('[data-testid="share-check-retry"]', 'Enter');
  await page.waitForFunction(() => window.__shareCheckReleases.length > 0);
  await loaded(80);
  const busy = await page.evaluate(() => {
    const button = document.querySelector('[data-testid="share-check-retry"]');
    const rect = button.getBoundingClientRect();
    return {
      disabled: button.disabled,
      text: button.textContent.trim(),
      feedback: document.querySelector('[data-testid="share-refresh-error"]')
        ?.textContent,
      width: rect.width,
      height: rect.height,
    };
  });
  assert.equal(busy.disabled, true);
  assert.equal(busy.text, '检查中');
  assert.ok(busy.feedback.includes('状态检查失败，当前内容已保留。'));
  assert.ok(busy.width >= 44 && busy.height >= 44);
  await capture('checking');
  await page.evaluate(() => {
    window.__shareHoldCheck = false;
    for (const release of window.__shareCheckReleases) release();
  });
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="share-refresh-error"]'),
  );
  await loaded(80);
  assert.equal(await page.url(), url);
  const injectedErrors = unexpectedSharingErrors(
    await readBrowserErrors(page),
    `${config.origin}/i/${config.statusIds.missing}?type=thumbnail`,
  );
  assert.deepEqual(
    injectedErrors.filter(
      (entry) =>
        entry.kind !== 'console.error' ||
        ![
          '分享列表读取失败 [object Object]',
          '分享状态检查失败 [object Object]',
        ].includes(entry.message),
    ),
    [],
    'Only the deliberately injected request failures were reported',
  );
  assert.equal(
    injectedErrors.filter(
      (entry) => entry.message === '分享列表读取失败 [object Object]',
    ).length,
    1,
  );
  assert.ok(
    injectedErrors.some(
      (entry) => entry.message === '分享状态检查失败 [object Object]',
    ),
  );
  record(
    'Injected list/check failures retain loaded cards and busy retry feedback; full successful retry stays on the same page, with expected diagnostic errors inspected',
    { busy },
  );
  await open('password');
  if (
    await page.evaluate(
      () => !!document.querySelector('[data-testid="share-password-input"]'),
    )
  ) {
    await page.fill('[data-testid="share-password-input"]', config.password);
    await page.click('[data-testid="share-password-submit"]');
    await page.waitForSelector('[data-testid="share-items"]');
  }
  await sql(
    `UPDATE album_shares SET auth_revision=auth_revision+1 WHERE album_id='${config.albums.password.id}'`,
  );
  await page.waitForSelector('[data-testid="share-password-input"]', {
    timeout: 15000,
  });
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-share-item]').length,
    ),
    0,
  );
  assert.equal(
    await page.evaluate(
      (name) => document.querySelector('main').textContent.includes(name),
      config.albums.password.name,
    ),
    false,
  );
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    ),
    'share-password-input',
  );
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('main')
        .textContent.includes('访问已失效，请重新输入分享密码。'),
    ),
    true,
  );
  await capture('authorization-expired');
  await passwordHelp('authorization-expired');
  record(
    'Password grant revocation clears album data, returns to the existing password form and focuses its input',
  );
  await callbackFailure();
  await firstReadRecovery();
}

async function firstReadRecovery() {
  await sql(
    `UPDATE album_shares SET auth_revision=auth_revision+1 WHERE album_id='${config.albums.password.id}'`,
  );
  await open('password');
  await page.waitForSelector('[data-testid="share-password-input"]');
  const url = await page.url();
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      if (String(args[0]).includes('/items')) {
        window.fetch = original;
        const response = await original(...args);
        window.__shareFirstReadHTTP = {
          status: response.status,
          count: (await response.json()).items?.length ?? null,
        };
        await new Promise((resolve) => {
          window.__releaseShareFirstRead = resolve;
        });
        return Response.json(
          { message: 'Injected first read failure' },
          { status: 503 },
        );
      }
      return original(...args);
    };
  });
  await page.fill('[data-testid="share-password-input"]', config.password);
  await page.click('[data-testid="share-password-submit"]');
  await page.waitForFunction(() => !!window.__releaseShareFirstRead);
  const firstRead = await page.evaluate(() => window.__shareFirstReadHTTP);
  assert.equal(
    firstRead.status,
    200,
    'The authorized first read actually succeeds',
  );
  assert.ok(firstRead.count > 0 && firstRead.count <= 40);
  await capture('first-read-loading');
  await page.evaluate(() => window.__releaseShareFirstRead());
  await page.waitForSelector('[data-testid="share-retry"]');
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-share-item]').length,
    ),
    0,
  );
  await capture('first-read-failed');
  const failures = await readBrowserErrors(page);
  assert.deepEqual(
    failures.map(({ kind, message }) => ({ kind, message })),
    [{ kind: 'console.error', message: '分享列表读取失败 [object Object]' }],
    'Only the deliberately injected first-read failure is reported',
  );
  const expected = json(await page.fetch(`${path('password')}/items`));
  assert.ok(expected.items.length > 0 && expected.items.length <= 40);
  assertCropped(expected);
  await page.click('[data-testid="share-retry"]');
  await loaded(expected.items.length);
  assert.equal(await page.url(), url);
  record(
    'A real successful unlock retains its grant through first-read dependency failure; retry loads the album on the same URL',
  );
}

async function callbackFailure() {
  await page.evaluate(() => {
    const original = window.fetch;
    window.__shareCallbackErrors = [];
    window.addEventListener('unhandledrejection', (event) => {
      window.__shareCallbackErrors.push(String(event.reason));
    });
    window.fetch = (...args) => {
      if (String(args[0]).includes('/items')) {
        window.fetch = original;
        // The successful unlock callback now encounters a programming/contract error.
        return Promise.resolve(Response.json({ showName: false, items: null }));
      }
      return original(...args);
    };
  });
  await page.fill('[data-testid="share-password-input"]', config.password);
  await page.click('[data-testid="share-password-submit"]');
  await page.waitForFunction(() => window.__shareCallbackErrors.length === 1);
  const callbackErrors = await page.evaluate(
    () => window.__shareCallbackErrors,
  );
  assert.deepEqual(callbackErrors, [
    "TypeError: Cannot read properties of null (reading 'map')",
  ]);
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('main')
        .textContent.includes('连接遇到问题，无法确认验证结果'),
    ),
    false,
    'A programming error in the unlock callback is not reported as a network error',
  );
  const errors = await readBrowserErrors(page);
  assert.deepEqual(
    errors.map(({ kind, message }) => ({ kind, message })),
    [
      {
        kind: 'unhandledrejection',
        message: callbackErrors[0],
      },
    ],
    'Only the deliberately injected callback error is reported',
  );
  await open('password');
  await page.waitForSelector('[data-testid="share-items"]');
  record(
    'Successful unlock callback errors retain their actual diagnostic instead of being swallowed by network handling',
  );
}

async function races() {
  report.stage = 'late-responses';
  await updateShare({ enabled: 1, show_name: 1, layout: 'grid' });
  await open();
  await loaded(40);
  await ensureVisible();
  await capture('grid-names');
  await instrument();
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      if (String(args[0]).includes('/items')) {
        const response = await original(...args);
        window.__shareLateNames = (await response.clone().json()).items.some(
          (item) => 'displayName' in item,
        );
        await new Promise((resolve) => {
          window.__releaseShareItems = resolve;
        });
        window.fetch = original;
        return response;
      }
      return original(...args);
    };
  });
  await page.click('[data-testid="share-load-more"]');
  await page.waitForFunction(() => !!window.__releaseShareItems);
  await capture('loading-more');
  assert.equal(await page.evaluate(() => window.__shareLateNames), true);
  await updateShare({ show_name: 0 });
  await ensureVisible();
  await page.waitForFunction(
    (names) =>
      !names.some((name) =>
        document.querySelector('main').textContent.includes(name),
      ),
    config.names,
    { timeout: 15000 },
  );
  await page.evaluate(() => window.__releaseShareItems());
  await waitForPaint();
  await hiddenNames();
  await loaded(40);
  record(
    'Late pre-policy list response cannot restore display names after showName turns off',
  );
  await page.evaluate(() => {
    const original = window.fetch;
    let held = false;
    window.fetch = async (...args) => {
      if (String(args[0]).endsWith('/refresh') && !held) {
        held = true;
        const response = await original(...args);
        window.__shareHeldResponse = await response.clone().json();
        await new Promise((resolve) => {
          window.__releaseShareRefresh = resolve;
        });
        return response;
      }
      return original(...args);
    };
  });
  await ensureVisible();
  await page.waitForFunction(() => !!window.__releaseShareRefresh, undefined, {
    timeout: 15000,
  });
  const heldRequestCount = (await traffic()).filter((entry) =>
    entry.url.endsWith('/refresh'),
  ).length;
  await page.evaluate(() => {
    window.__shareHoldStarted = Date.now();
  });
  await page.waitForFunction(
    () => Date.now() - window.__shareHoldStarted >= 5500,
    undefined,
    { timeout: 10000 },
  );
  assert.equal(
    (await traffic()).filter((entry) => entry.url.endsWith('/refresh')).length,
    heldRequestCount,
    'A pending refresh is not overlapped by the next poll',
  );
  // Visibility changes cancel the obsolete batch; a fresh generation sees revocation.
  await hidePage();
  await updateShare({ enabled: 0 });
  await ensureVisible();
  await page.waitForSelector('[data-testid="share-state"]');
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-share-item]').length,
    ),
    0,
  );
  await page.evaluate(() => window.__releaseShareRefresh());
  await waitForPaint();
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-share-item]').length,
    ),
    0,
  );
  assert.equal(
    await page.evaluate(
      (name) => document.querySelector('main').textContent.includes(name),
      config.albums.public.name,
    ),
    false,
  );
  await capture('revoked');
  record(
    'No overlapping state checks; revocation clears all data and late authorized refresh cannot refill it',
  );
  await updateShare({ enabled: 1 });
}

try {
  errorScript = await installBrowserErrors(page);
  if (
    !config.sharingPublicPhase ||
    config.sharingPublicPhase === 'representative'
  )
    await gateAndRepresentatives();
  if (!config.sharingPublicPhase || config.sharingPublicPhase === 'behavior')
    await behavior();
  if (!config.sharingPublicPhase || config.sharingPublicPhase === 'race')
    await races();
  if (config.sharingPublicPhase === 'recovery') await recoveries();
  const errors = await readBrowserErrors(page);
  const unexpected = unexpectedSharingErrors(
    errors,
    `${config.origin}/i/${config.statusIds.missing}?type=thumbnail`,
  );
  assert.deepEqual(unexpected, [], 'No unexpected runtime or resource errors');
  report.expectedThumbnailErrors = errors.length - unexpected.length;
  report.status = 'passed';
} catch (error) {
  let message = String(error.stack ?? error);
  for (const token of Object.values(config.albums).map((album) => album.token))
    message = message.replaceAll(token, '[redacted]');
  report.error = message;
  await page.screenshot({
    path: join(config.output, 'sharing-public-failure.png'),
  });
  throw new Error(message);
} finally {
  if (backgroundPage) await backgroundPage.close();
  if (errorScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errorScript,
    });
  await writeFile(
    join(config.output, 'sharing-public.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log(JSON.stringify(report));
