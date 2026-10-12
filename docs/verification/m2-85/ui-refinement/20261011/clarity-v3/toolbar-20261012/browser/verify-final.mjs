const { default: assert } = await import('node:assert/strict');
const { mkdir, readFile, writeFile } = await import('node:fs/promises');
const { resolve, join } = await import('node:path');
const { pathToFileURL } = await import('node:url');
const root = '/Volumes/data/project/ariso';
const { verifySearchToolbarLayouts } = await import(
  pathToFileURL(resolve(root, 'e2e/search-toolbar-layout.mjs')).href
);
const output = resolve(root, '.data/toolbar-20261012/browser-final');
await mkdir(output, { recursive: true });
const task = await taskSpace(9);
const page = task.page('p1');
const origin = 'http://127.0.0.1:3001';
const albumPath = '/albums/02f20327-38cc-49f9-8740-9d409ba99d4d?page=1';
const report = { status: 'failed', layouts: [], checks: [] };
try {
  await page.goto(`${origin}/api/health`);
  const config = JSON.parse(
    await readFile(
      resolve(root, '.data/main-ui-review-20261011/private.json'),
      'utf8',
    ),
  );
  const signedIn = await page.fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: config.email, password: config.password }),
  });
  assert.equal(signedIn.status, 200);
  for (const [name, path] of [
    ['library', '/library'],
    ['album', albumPath],
    ['trash', '/trash'],
  ]) {
    await page.goto(`${origin}${path}`);
    await page.waitForSelector('[data-testid="library-toolbar"]');
    const card =
      name === 'trash'
        ? '[data-trash-open]'
        : '[data-testid="library-card"] button[data-library-open]';
    await page.waitForSelector(card);
    await page.evaluate(() => document.fonts.ready);
    report.layouts.push(
      ...(await verifySearchToolbarLayouts(page, {
        output,
        name: `${name}-toolbar-idle`,
      })),
    );
    if (name === 'album') {
      const title = await page.evaluate(() => {
        const bounds = (node) => {
          const r = node.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        };
        return {
          title: bounds(document.querySelector('#library-title')),
          back: bounds(document.querySelector('a[aria-label="返回相册列表"]')),
        };
      });
      assert.ok(
        title.back.top < title.title.bottom &&
          title.back.bottom > title.title.top,
      );
      await page.click('button:has-text("添加图片")');
      await page.waitForSelector('[role="menu"][aria-label="添加相册图片"]');
      const entries = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[role="menu"][aria-label="添加相册图片"] [role="menuitem"]',
          ),
        ].map((node) => node.textContent.trim()),
      );
      assert.deepEqual(entries, ['上传新图片', '从图库选择']);
      await page.keyboard.press('Escape');
      await page.waitForSelector('[role="menu"][aria-label="添加相册图片"]', {
        state: 'hidden',
      });
      report.checks.push(
        'Album actions are inside the query toolbar; Return stays beside the title; Add retains both menu entries.',
      );
    }
    const check =
      name === 'trash'
        ? 'label:has(input[aria-label^="选择回收图片："]) >> nth=0'
        : 'label:has(input[aria-label^="选择图片："]) >> nth=0';
    if (name === 'trash') await page.click('button[aria-label="选择记录"]');
    else await page.hover(`${card} >> nth=0`);
    await page.click(check);
    await page.waitForSelector('button[aria-label="管理选择，已选 1 张"]');
    report.layouts.push(
      ...(await verifySearchToolbarLayouts(page, {
        output,
        name: `${name}-toolbar-selected`,
        selected: true,
      })),
    );
    await page.click(check);
    await page.waitForSelector('button[aria-label^="管理选择，已选"]', {
      state: 'hidden',
    });
    if (name === 'trash') await page.click('button[aria-label="取消选择"]');
    report.checks.push(
      `${name}: selecting and deselecting one existing image succeeds without a business mutation.`,
    );
  }
  report.status = 'passed';
} catch (error) {
  report.error = error.stack;
  await page.screenshot({ path: join(output, 'failure.png') });
  throw error;
} finally {
  await writeFile(
    join(output, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      status: report.status,
      layouts: report.layouts.length,
      checks: report.checks,
    }),
  );
}
await page.goto(`${origin}${albumPath}`);
await page.waitForSelector('[role="toolbar"][aria-label="相册操作"]');
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(output, 'album-final.png') });
console.log(await page.snapshot());
