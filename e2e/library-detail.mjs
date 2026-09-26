import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer, request } from 'node:http';
import { once } from 'node:events';

// Exercise the browser's real policy enforcement while all application bytes,
// API responses and cookies still come from the disposable production server.
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
      errors.push(error);
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end('Browser verification proxy could not reach production');
    });
    incoming.pipe(forwarded);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    origin: `http://${upstream.hostname}:${server.address().port}`,
    errors,
    async close() {
      const closed = new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      server.closeAllConnections();
      await closed;
    },
  };
}

// Add real saved versions to existing cards without changing list pagination.
export async function seedLibraryDetail(config, sql, directory, storageId) {
  const bytes = await readFile(
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  );
  for (const id of ['library-007', 'library-003', 'library-008']) {
    for (const kind of ['original', 'compressed']) {
      const object = `detail-${id}-${kind}`;
      await writeFile(join(directory, `${object}.png`), bytes);
      await sql(
        `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) VALUES ('${object}','${id}','${storageId}','library-fixtures/${object}.png','${kind}','stored',${bytes.length},'png','image/png',1700000000000,1700000000000)`,
      );
      await sql(
        `INSERT INTO media_versions (image_id,kind,object_id,width,height,byte_size,format,mime,created_at) VALUES ('${id}','${kind}','${object}',640,480,${bytes.length},'png','image/png',1700000000000)`,
      );
    }
  }
  await sql(
    "UPDATE media_images SET original_name = '中文下载样本.png', display_name = '中文下载样本.png', visibility = 'public' WHERE id = 'library-007'",
  );
}

export async function verifyLibraryDetail({ page, config, sql, report }) {
  const dialog = '[data-testid="library-detail"]';
  const button = (name) => `loc=role:button[name="${name}"]`;
  const menuAction = async (name) => {
    await page.click(button('更多操作'));
    await page.click(`loc=role:menuitem[name="${name}"]`);
  };
  const close = async () => {
    await page.click(button('返回图库'));
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="library-detail"]'),
    );
  };
  const direct = async (id) => {
    await page.goto(`${config.origin}/library?image=${id}`);
    await page.waitForSelector(dialog);
    await page.waitForSelector('[data-testid="detail-body"]');
  };
  const layouts = async (state) => {
    for (const theme of ['light', 'dark']) {
      await page.cdp('Emulation.setEmulatedMedia', {
        features: [
          { name: 'prefers-color-scheme', value: theme },
          { name: 'prefers-reduced-motion', value: 'reduce' },
        ],
      });
      await page.waitForFunction(
        (value) => document.documentElement.classList.contains(value),
        theme,
      );
      for (const width of [360, 390, 430, 768, 1440]) {
        await page.cdp('Emulation.setDeviceMetricsOverride', {
          width,
          height: 844,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await page.waitForFunction((value) => innerWidth === value, width);
        const layout = await page.evaluate(() => {
          const dialogs = [...document.querySelectorAll('[role="dialog"]')];
          const active = dialogs.at(-1);
          return {
            width: innerWidth,
            overflow: document.documentElement.scrollWidth > innerWidth,
            dialogOverflow: active.scrollWidth > active.clientWidth,
            targets: [
              ...active.querySelectorAll(
                'button,[role="tab"],[role="combobox"],a',
              ),
            ]
              .filter((node) => node.getBoundingClientRect().width > 0)
              .map((node) => ({
                name: node.getAttribute('aria-label') || node.textContent,
                width: node.getBoundingClientRect().width,
                height: node.getBoundingClientRect().height,
              })),
          };
        });
        if (state === 'ready') {
          const heights = await page.evaluate(() =>
            [
              ...document.querySelectorAll(
                '[data-testid="detail-actions"] button',
              ),
            ]
              .filter((node) => node.getBoundingClientRect().width > 0)
              .map((node) => node.getBoundingClientRect().height),
          );
          for (const height of heights)
            assert.ok(
              Math.abs(height - 48) <= 1,
              'Detail footer actions retain the 48px design height',
            );
        }
        if (state === 'ready' && width < 768) {
          const actions = await page.evaluate(() => {
            const row = document.querySelector(
              '[data-testid="detail-actions"]',
            );
            return {
              width: row.getBoundingClientRect().width,
              buttons: [...row.querySelectorAll('button')]
                .filter((node) => node.getBoundingClientRect().width > 0)
                .map((node) => node.getBoundingClientRect().width),
            };
          });
          assert.ok(
            actions.width >= width - 34,
            'Mobile action row fills the 16px page insets',
          );
          assert.equal(actions.buttons.length, 2);
          for (const buttonWidth of actions.buttons)
            assert.ok(
              Math.abs(buttonWidth - (actions.width - 12) / 2) <= 2,
              'Copy and More evenly fill the mobile footer',
            );
        }
        if (state === 'ready' && width >= 768) {
          const widths = await page.evaluate(() =>
            [
              ...document.querySelectorAll(
                '[data-testid="detail-actions"] button',
              ),
            ]
              .filter((node) => node.getBoundingClientRect().width > 0)
              .map((node) => node.getBoundingClientRect().width),
          );
          assert.equal(
            widths.length,
            3,
            'Desktop keeps Copy, Download and More',
          );
          for (const buttonWidth of widths)
            assert.ok(
              Math.abs(buttonWidth - 200) <= 2,
              'Desktop actions retain the 200px design width',
            );
        }
        assert.equal(
          layout.overflow,
          false,
          `${state}/${theme}/${width}: page overflow`,
        );
        assert.equal(
          layout.dialogOverflow,
          false,
          `${state}/${theme}/${width}: dialog overflow`,
        );
        for (const target of layout.targets)
          assert.ok(
            target.width >= 44 && target.height >= 44,
            `${target.name}: 44px target`,
          );
        if (
          (state === 'ready' && [390, 1440].includes(width)) ||
          (['copy', 'clipboard-denied'].includes(state) &&
            theme === 'light' &&
            width === 390)
        ) {
          await page.screenshot({
            path: join(config.output, `detail-${state}-${theme}-${width}.png`),
          });
        }
        report.layouts.push({ state: `detail-${state}`, theme, ...layout });
      }
    }
  };
  const interceptDetail = async (mode) => {
    await page.evaluate((mode) => {
      const original = window.fetch;
      window.__detailRelease = undefined;
      window.fetch = async (...args) => {
        if (
          !new URL(String(args[0]), location.href).pathname.startsWith(
            '/api/images/',
          )
        )
          return original(...args);
        window.fetch = original;
        const response = await original(...args);
        if (mode === 'fail')
          throw new TypeError(
            'Verification: real detail response lost at fetch boundary',
          );
        await new Promise((resolve) => {
          window.__detailRelease = resolve;
        });
        return response;
      };
    }, mode);
  };
  await page.goto(`${config.origin}/library`);
  await page.waitForSelector('[data-image-id="library-007"]');
  await interceptDetail('hold');
  await page.click(button('查看图片：中文下载样本.png'));
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="library-detail"]')
      ?.textContent.includes('正在读取图片详情'),
  );
  await layouts('loading');
  await page.waitForFunction(
    () => typeof window.__detailRelease === 'function',
  );
  await page.evaluate(() => window.__detailRelease());
  await page.waitForSelector('[data-testid="detail-body"]');
  await interceptDetail('fail');
  await menuAction('刷新详情');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="library-detail"]')
      ?.textContent.includes('图片详情读取失败'),
  );
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="detail-body"]'),
    ),
    false,
    'Failed fresh detail read hides stale content',
  );
  await layouts('error');
  await page.click(button('刷新详情'));
  await page.waitForSelector('[data-testid="detail-body"]');
  await close();
  report.checks.push(
    'Holding the real detail response exposes loading; losing a real refresh response exposes an error and hides stale content; refresh retries the real endpoint.',
  );
  await page.focus(button('查看图片：中文下载样本.png'));
  const scroll = await page.evaluate(
    () => document.querySelector('.shell-content').scrollTop,
  );
  await page.keyboard.press('Enter');
  await page.waitForSelector(dialog);
  await page.waitForSelector('[data-testid="detail-preview"]');
  assert.equal(
    new URL(await page.url()).searchParams.get('image'),
    'library-007',
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="library-detail"]'),
  );
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('aria-label') ===
      '查看图片：中文下载样本.png',
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelector('.shell-content').scrollTop,
    ),
    scroll,
  );
  report.checks.push(
    'Detail opens through actual keyboard card activation; Escape restores the card focus and library scroll position.',
  );

  await direct('library-007');
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-testid="detail-preview"]');
    return image?.complete && image.naturalWidth > 0;
  });
  await layouts('ready');
  await page.focus(button('更多操作'));
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => {
    const active = document.activeElement;
    return (
      active?.getAttribute('role') === 'menuitem' &&
      active.textContent.trim() === '刷新详情' &&
      active.getBoundingClientRect().height >= 44
    );
  });
  assert.equal(
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="menuitem"]')].some((node) =>
        node.textContent.startsWith('下载'),
      ),
    ),
    false,
  );
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(
    () => document.activeElement?.textContent.trim() === '回收图片',
  );
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(
    () => document.activeElement?.textContent.trim() === '刷新详情',
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => document.activeElement?.textContent.trim() === '更多操作',
  );
  report.checks.push(
    'Desktop keyboard opens More on the visible Refresh item; arrow navigation cycles only visible actions and Escape restores More.',
  );
  await page.click('loc=role:tab[name="压缩图"]');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="detail-preview"]')
      ?.getAttribute('src')
      ?.includes('type=compressed'),
  );
  await page.click(button('复制链接'));
  await page.waitForSelector('loc=role:dialog[name="复制图片链接"]');
  await layouts('copy');
  await page.click(button('复制 URL'));
  await page.waitForFunction(() =>
    document
      .querySelector('[role="dialog"][aria-label="复制图片链接"]')
      ?.textContent.includes('已复制到剪贴板'),
  );
  report.checks.push(
    'Real Clipboard write succeeds after clicking Copy URL; no clipboard read permission is requested.',
  );
  await page.click(button('返回详情'));
  const deniedProxy = await clipboardDeniedProxy(config.origin);
  try {
    await page.goto(`${deniedProxy.origin}/library?image=library-007`);
    await page.waitForSelector('[data-testid="detail-body"]');
    await page.click('loc=role:tab[name="压缩图"]');
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="detail-preview"]')
        ?.getAttribute('src')
        ?.includes('type=compressed'),
    );
    await page.click(button('复制链接'));
    await page.waitForSelector('[data-testid="copy-resolution"]');
    await page.click(button('复制 URL'));
    await page.waitForSelector('loc=role:heading[name="浏览器未允许自动复制"]');
    const manual = await page.evaluate(() => {
      const input = document.querySelector(
        'textarea[aria-label="手动复制文本"]',
      );
      return {
        value: input.value,
        selected:
          input.selectionStart === 0 &&
          input.selectionEnd === input.value.length,
        focused: input === document.activeElement,
      };
    });
    assert.equal(new URL(manual.value).searchParams.has('type'), false);
    assert.equal(manual.selected, true);
    assert.equal(manual.focused, true);
    await layouts('clipboard-denied');
    await page.click(button('返回复制选项'));
    await page.click('loc=role:button[name*="复制版本"]');
    await page.waitForSelector('loc=role:option[name="原图"]');
    await page.click('loc=role:option[name="原图"]');
    await page.click(button('复制 Markdown'));
    await page.waitForSelector('textarea[aria-label="手动复制文本"]');
    assert.match(
      await page.evaluate(
        () =>
          document.querySelector('textarea[aria-label="手动复制文本"]').value,
      ),
      /type=original/,
    );
    await page.click(button('返回复制选项'));
    await page.click(button('复制 HTML'));
    await page.waitForSelector('textarea[aria-label="手动复制文本"]');
    assert.match(
      await page.evaluate(
        () =>
          document.querySelector('textarea[aria-label="手动复制文本"]').value,
      ),
      /^<img src=".*type=original"/,
    );
    await page.click(button('返回复制选项'));
    await page.click(button('返回详情'));
    assert.ok(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="detail-preview"]')
          ?.getAttribute('src')
          ?.includes('type=compressed'),
      ),
    );
    assert.deepEqual(
      deniedProxy.errors,
      [],
      'Policy proxy forwards real production responses without errors',
    );
  } finally {
    await deniedProxy.close();
  }
  await direct('library-007');
  await page.click('loc=role:tab[name="压缩图"]');
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await page.waitForFunction(() => innerWidth === 390);
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await menuAction('下载压缩图');
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), '中文下载样本.png');
  await download.saveAs(join(config.output, '中文下载样本.png'));
  assert.deepEqual(
    await readFile(join(config.output, '中文下载样本.png')),
    await readFile(
      join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
    ),
  );
  report.checks.push(
    'Direct detail URL decodes real saved bytes; viewing compressed does not change default copy selection; actual Chromium Permissions-Policy clipboard denial exposes focused selected text; download preserves Chinese filename and real bytes.',
  );
  await sql("UPDATE media_settings SET default_link_version = 'original'");
  await page.click(button('复制链接'));
  await page.waitForSelector('loc=role:dialog[name="复制图片链接"]');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="copy-resolution"]')
      ?.textContent.includes('当前默认：原图'),
  );
  const current = await page.fetch('/api/images/library-007');
  const updated = JSON.parse(current.body);
  assert.equal(updated.defaultVersion, 'original');
  assert.equal(updated.defaultLink.actualVersion, 'original');
  assert.equal(
    new URL(updated.defaultLink.links.url).searchParams.has('type'),
    false,
  );
  await page.click(button('返回详情'));
  assert.ok(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="detail-preview"]')
        ?.getAttribute('src')
        ?.includes('type=compressed'),
    ),
  );
  await sql("UPDATE media_settings SET default_link_version = 'compressed'");
  await close();
  // An explicit unsaved version must fail at the real delivery endpoint.
  assert.equal((await page.fetch('/i/library-007?type=watermark')).status, 404);
  report.checks.push(
    'Changing the real default setting is reflected when copy reopens while the compressed preview stays selected; default URLs omit type; unsaved explicit watermark returns 404.',
  );
  for (const [id, state, text] of [
    ['library-003', 'failed-private', '处理失败'],
    ['library-006', 'disabled', '存储已停用'],
    ['library-008', 'pending', '等待处理'],
  ]) {
    await direct(id);
    assert.ok(
      await page.evaluate(
        (text) =>
          document
            .querySelector('[data-testid="library-detail"]')
            .textContent.includes(text),
        text,
      ),
    );
    await layouts(state);
    await close();
  }
  await direct('library-000');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="library-detail"]')
      ?.textContent.includes('当前版本读取失败'),
  );
  assert.equal(
    await page.evaluate(() =>
      performance.getEntriesByType('resource').some((entry) => {
        const url = new URL(entry.name);
        return (
          url.pathname === '/i/library-000' &&
          url.searchParams.get('type') !== 'thumbnail'
        );
      }),
    ),
    false,
    'Real missing thumbnail file does not request original as fallback',
  );
  await page.click(button('下载缩略图'));
  await page.waitForFunction(() =>
    [
      ...document.querySelectorAll(
        '[data-testid="library-detail"] [role="alert"]',
      ),
    ].some((node) => node.textContent.includes('下载不可用（HTTP 404）')),
  );
  assert.equal(
    await page.evaluate(() =>
      performance.getEntriesByType('resource').some((entry) => {
        const url = new URL(entry.name);
        return (
          url.pathname === '/i/library-000' &&
          url.searchParams.get('type') !== 'thumbnail'
        );
      }),
    ),
    false,
    'Failed download HEAD must not request another version',
  );
  report.checks.push(
    'Missing thumbnail download HEAD returns 404 and displays the explicit download error without requesting another version.',
  );
  const [missingObject] = await sql(
    "SELECT o.key, s.id AS storage_id, s.local_path FROM media_objects o JOIN storage_configs s ON s.id = o.storage_id WHERE o.image_id = 'library-000' AND o.purpose = 'thumbnail'",
  );
  await writeFile(
    join(
      config.dataDirectory,
      'storage',
      missingObject.local_path,
      'ariso',
      missingObject.storage_id,
      missingObject.key,
    ),
    await readFile(
      join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
    ),
  );
  await menuAction('刷新详情');
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-testid="detail-preview"]');
    return (
      image?.complete &&
      image.naturalWidth > 0 &&
      new URL(image.src).searchParams.get('type') === 'thumbnail'
    );
  });
  assert.equal(
    await page.evaluate(() =>
      performance.getEntriesByType('resource').some((entry) => {
        const url = new URL(entry.name);
        return (
          url.pathname === '/i/library-000' &&
          url.searchParams.get('type') !== 'thumbnail'
        );
      }),
    ),
    false,
    'Manual refresh retries the repaired thumbnail without changing version',
  );
  report.checks.push(
    'After a real thumbnail file read failure, restoring the fixture file and manually refreshing decodes that same thumbnail without an original fallback.',
  );
  await close();
  await direct('library-007');
  const missing = await page.evaluate(() =>
    [...document.querySelectorAll('[role="tab"]')]
      .find((node) => node.textContent.includes('水印图'))
      ?.getAttribute('aria-disabled'),
  );
  assert.equal(missing, 'true');
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 400,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await page.waitForFunction(() => {
    const button = [
      ...document.querySelectorAll('[data-testid="library-detail"] button'),
    ].find((node) => node.textContent.includes('复制链接'));
    const rect = button?.getBoundingClientRect();
    return (
      innerWidth === 390 &&
      innerHeight === 400 &&
      rect?.top >= 0 &&
      rect.bottom <= innerHeight
    );
  });
  const footerActions = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="library-detail"] button')]
      .filter((node) => node.getBoundingClientRect().width > 0)
      .map((node) => node.textContent.trim()),
  );
  assert.ok(footerActions.includes('更多操作'));
  assert.equal(
    footerActions.some((name) => name.startsWith('下载')),
    false,
  );
  assert.equal(footerActions.includes('回收图片'), false);
  await page.click(button('更多操作'));
  await page.waitForSelector('loc=role:menuitem[name="下载压缩图"]');
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => document.activeElement?.textContent.trim() === '更多操作',
  );
  await menuAction('回收图片');
  await page.waitForSelector('[data-testid="trash-confirm"]');
  assert.equal(
    await page.evaluate(() => !!document.querySelector('[role="menu"]')),
    false,
  );
  await page.click(button('取消'));
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="trash-confirm"]'),
  );
  await page.waitForFunction(
    () => document.activeElement?.textContent.trim() === '更多操作',
  );
  report.checks.push(
    'Mobile details keep Copy and More in the fixed footer; download, refresh and trash use the real menu; Escape and cancelling trash return focus to the persistent More button.',
  );
  await page.evaluate(() => {
    const body = document.querySelector('[data-testid="detail-body"]');
    body.scrollTop = body.scrollHeight;
  });
  assert.equal(
    await page.evaluate(() => {
      const button = [
        ...document.querySelectorAll('[data-testid="library-detail"] button'),
      ].find((node) => node.textContent.includes('复制链接'));
      const rect = button.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight;
    }),
    true,
  );
  await page.click(button('复制链接'));
  await page.waitForSelector('loc=role:dialog[name="复制图片链接"]');
  await page.click(button('返回详情'));
  await page.waitForFunction(
    () => !document.querySelector('[role="dialog"][aria-label="复制图片链接"]'),
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({
    path: join(config.output, 'detail-short-viewport.png'),
  });
  await close();
  report.checks.push(
    'Real failed/private, pending and disabled-storage records show their states across five widths and both themes; missing watermark is disabled; short viewport copy action opens the real copy dialog.',
  );
}
