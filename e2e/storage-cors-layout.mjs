import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

export async function verifyCopiedCorsExample(page, report) {
  const expected = await page.evaluate(
    () => document.querySelector('[role="dialog"] textarea').value,
  );
  const { stdout } = await promisify(execFile)('pbpaste', [], {
    encoding: 'utf8',
  });
  // Do not expose clipboard contents if another application copied concurrently.
  assert.equal(
    stdout === expected,
    true,
    'Actual macOS clipboard equals the complete displayed CORS JSON',
  );
  (report.clipboardChecks ??= []).push({
    mechanism: 'macOS pbpaste immediately after application copy',
    completeJsonEqual: true,
  });
}

const button = (name) => `loc=role:button[name="${name}"]`;
export async function settleCorsScreenshot(page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  );
  await page.waitForFunction(
    () => !document.querySelector('[data-slot="toast"]'),
  );
}
export async function ensureCorsOverview(page) {
  await page.waitForFunction(() => {
    const state = document.querySelector('[data-testid="storage-cors"]')
      ?.dataset.state;
    return state && state !== 'loading';
  });
  const overview = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some(
      (button) => button.textContent.trim() === '查看 CORS 示例',
    ),
  );
  if (overview) return;
  await page.click(button('查看清理状态'));
  await page.waitForSelector('[role="dialog"]');
  await page.click(button('返回直传设置'));
  await page.waitForSelector(button('查看 CORS 示例'));
}
async function resize(page, width, height = width >= 1200 ? 1080 : 844) {
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await page.waitForFunction((width) => innerWidth === width, width);
}
export async function verifyCorsLayouts(
  page,
  config,
  state,
  report,
  widths = [360, 390, 430, 768, 1440],
) {
  for (const theme of ['light', 'dark']) {
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: theme },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await page.waitForFunction(
      (theme) => document.documentElement.classList.contains(theme),
      theme,
    );
    for (const width of widths) {
      await resize(page, width);
      const layout = await page.evaluate(() => {
        return {
          width: innerWidth,
          height: innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          targets: [
            ...document.querySelectorAll(
              '[data-testid="storage-cors"] button, [data-testid="storage-cors"] a, [data-testid="storage-cors"] textarea, .shell-footer button, .shell-footer a',
            ),
          ]
            .filter((node) => node.getClientRects().length)
            .map((node) => {
              const bounds = node.getBoundingClientRect();
              return {
                name:
                  node.getAttribute('aria-label') || node.textContent?.trim(),
                width: bounds.width,
                height: bounds.height,
              };
            }),
        };
      });
      assert.ok(
        layout.scrollWidth <= width + 1,
        `${state}: no horizontal overflow at ${width}`,
      );
      if (width < 768)
        for (const target of layout.targets) {
          assert.ok(
            target.width >= 44 && target.height >= 44,
            `${target.name}: ${target.width} × ${target.height}`,
          );
        }
      const screenshot = `cors-${state}-${theme}-${width}.png`;
      await settleCorsScreenshot(page);
      await page.screenshot({ path: join(config.output, screenshot) });
      (report.layouts ??= []).push({ state, theme, ...layout, screenshot });
    }
  }
  await resize(page, 390);
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'light' }],
  });
}

export async function captureCorsDialog(page, config, state, report) {
  for (const theme of ['light', 'dark']) {
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: theme }],
    });
    await page.waitForFunction(
      (theme) => document.documentElement.classList.contains(theme),
      theme,
    );
    for (const width of [1440, 390]) {
      await resize(page, width);
      await settleCorsScreenshot(page);
      const bounds = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const rect = dialog.getBoundingClientRect();
        const footer = dialog.querySelector('[data-slot="modal-footer"]');
        const json = dialog.querySelector('textarea');
        return {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          footerWidth: footer.getBoundingClientRect().width,
          footerActions: [...footer.querySelectorAll('button,a')].map(
            (node) => ({
              name: node.textContent.trim(),
              width: node.getBoundingClientRect().width,
            }),
          ),
          jsonFontSize: json ? getComputedStyle(json).fontSize : null,
          targets: [...dialog.querySelectorAll('button,a')].map((node) => ({
            name: node.textContent.trim(),
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          })),
        };
      });
      assert.ok(bounds.left >= 0 && bounds.right <= width + 1);
      for (const action of bounds.footerActions)
        assert.ok(
          Math.abs(action.width - bounds.footerWidth) <= 1,
          `${action.name}: footer action must fill ${bounds.footerWidth}px, actual ${action.width}px`,
        );
      if (bounds.jsonFontSize !== null)
        assert.equal(
          bounds.jsonFontSize,
          '13px',
          'CORS JSON font matches the 13px Figma specification at desktop and mobile widths',
        );
      if (width < 768)
        for (const target of bounds.targets)
          assert.ok(
            target.width >= 44 && target.height >= 44,
            `${target.name}: mobile dialog hit area`,
          );
      const screenshot = `cors-${state}-${theme}-${width}.png`;
      await settleCorsScreenshot(page);
      await page.screenshot({ path: join(config.output, screenshot) });
      (report.dialogLayouts ??= []).push({
        state,
        theme,
        width,
        ...bounds,
        screenshot,
      });
    }
  }
  await resize(page, 390);
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'light' }],
  });
}

// Same technique as library-detail: preserve real application/cookies while
// making the browser enforce clipboard denial at its Permissions-Policy boundary.
async function clipboardDeniedProxy(origin) {
  const upstream = new URL(origin);
  const errors = [];
  const server = createServer((incoming, outgoing) => {
    const forwarded = request(
      new URL(incoming.url, `http://127.0.0.1:${upstream.port}`),
      {
        method: incoming.method,
        headers: { ...incoming.headers, host: upstream.host },
      },
      (response) => {
        outgoing.writeHead(response.statusCode, {
          ...response.headers,
          'permissions-policy': 'clipboard-write=()',
        });
        response.pipe(outgoing);
      },
    );
    forwarded.on('error', (error) => {
      errors.push(error.message);
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end('CORS UI verification proxy could not reach production');
    });
    incoming.pipe(forwarded);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    origin: `http://${upstream.hostname}:${server.address().port}`,
    errors,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

export async function verifyCorsDialogs(page, config, id, report) {
  await ensureCorsOverview(page);
  await verifyCorsLayouts(
    page,
    config,
    'overview-after-passed',
    report,
    [1440, 390],
  );
  await page.focus(button('查看 CORS 示例'));
  await page.keyboard.press('Enter');
  await page.waitForSelector('loc=role:dialog[name="CORS 配置示例"]');
  const example = await page.evaluate(() =>
    JSON.parse(document.querySelector('textarea').value),
  );
  assert.deepEqual(example[0].AllowedOrigins, [config.origin]);
  assert.deepEqual(example[0].AllowedMethods, ['PUT', 'GET', 'HEAD']);
  assert.ok(!example[0].AllowedMethods.includes('OPTIONS'));
  await captureCorsDialog(page, config, 'example', report);
  await page.click(button('复制 CORS 示例'));
  await page.waitForFunction(() =>
    document.body.textContent.includes('已复制'),
  );
  await verifyCopiedCorsExample(page, report);
  for (const width of [1440, 390]) {
    await resize(page, width, 480);
    await page.click(button('复制 CORS 示例'));
    const dialog = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const rect = dialog.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        viewportHeight: innerHeight,
        activeWithin: dialog.contains(document.activeElement),
      };
    });
    assert.ok(dialog.top >= 0 && dialog.bottom <= dialog.viewportHeight + 1);
    assert.equal(dialog.activeWithin, true);
    await settleCorsScreenshot(page);
    await page.screenshot({
      path: join(config.output, `cors-example-short-${width}.png`),
    });
    // Keyboard focus remains trapped in the dialog while cycling both directions.
    for (const key of ['Tab', 'Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      assert.equal(
        await page.evaluate(() =>
          document
            .querySelector('[role="dialog"]')
            .contains(document.activeElement),
        ),
        true,
      );
    }
  }
  await page.keyboard.press('Escape');
  await page.waitForSelector('loc=role:dialog[name="CORS 配置示例"]', {
    state: 'hidden',
  });
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent.trim()),
    '查看 CORS 示例',
  );

  const proxy = await clipboardDeniedProxy(config.origin);
  try {
    await resize(page, 390);
    await page.goto(`${proxy.origin}/settings/storage/${id}`);
    await ensureCorsOverview(page);
    await page.click(button('查看 CORS 示例'));
    await page.waitForSelector('loc=role:dialog[name="CORS 配置示例"]');
    await page.click(button('复制 CORS 示例'));
    await page.waitForFunction(() =>
      document
        .querySelector('[role="dialog"]')
        .textContent.includes('浏览器未允许自动复制'),
    );
    const manual = await page.evaluate(() => {
      const field = document.querySelector('[role="dialog"] textarea');
      return {
        value: field.value,
        focused: field === document.activeElement,
        selected:
          field.selectionStart === 0 &&
          field.selectionEnd === field.value.length,
      };
    });
    assert.deepEqual(JSON.parse(manual.value), example);
    assert.equal(manual.focused, true);
    assert.equal(manual.selected, true);
    await page.screenshot({
      path: join(config.output, 'cors-copy-denied-390.png'),
    });
    await page.click(button('返回直传设置'));
    // The alternate port is a genuinely different browser origin, while GET
    // still reads the same protected application data using the same host cookie.
    await page.click('[data-testid="cors-start"]');
    await page.waitForSelector(
      'loc=role:dialog[name="请从配置的站点地址检测"]',
    );
    const link = await page.evaluate(
      () =>
        [...document.querySelectorAll('[role="dialog"] a')].find(
          (node) => node.textContent.trim() === '打开配置地址',
        )?.href,
    );
    assert.equal(new URL(link).origin, config.origin);
    await captureCorsDialog(page, config, 'origin-mismatch', report);
    await page.screenshot({
      path: join(config.output, 'cors-origin-mismatch-390.png'),
    });
    await page.click('loc=role:link[name="打开配置地址"]');
    await page.waitForURL(`${config.origin}/settings/storage/${id}`);
    await page.waitForSelector(
      '[data-testid="storage-cors"][data-state="passed"]',
    );
    const remaining = await page.fetch(`/api/storages/${id}/cors-tests`);
    assert.equal(remaining.status, 200);
    assert.equal(JSON.parse(remaining.body).probes.length, 0);
    assert.deepEqual(proxy.errors, []);
  } finally {
    await proxy.close();
    await page.goto(`${config.origin}/settings/storage/${id}`);
    await ensureCorsOverview(page);
  }
  report.checks.push(
    'CORS example matches the current origin and methods; keyboard dialog focus/Escape restoration, short viewport, real clipboard success and Permissions-Policy denial with complete selected text verified; actual alternate-origin access shows configured-address guidance',
  );
}
