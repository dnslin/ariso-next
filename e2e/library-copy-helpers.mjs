import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { createBatchHelpers } from './library-batch-helpers.mjs';
import { resizeViewport, setTheme } from './browser-geometry.mjs';

const run = promisify(execFile);
export const copyDialog = '[data-testid="library-copy-dialog"]';
export const copyNames = {
  default: '默认（跟随站点）',
  original: '原图',
  compressed: '压缩图',
  thumbnail: '缩略图',
  watermark: '水印图',
};

export function createCopyHelpers(context) {
  const { page, config, report } = context;
  const batch = createBatchHelpers(context);
  async function open(count) {
    await batch.selected(count);
    await page.click(batch.button(`操作已选 ${count} 张图片`));
    await page.waitForSelector('loc=role:menuitem[name="复制链接"]');
    await page.click('loc=role:menuitem[name="复制链接"]');
    await page.waitForSelector(copyDialog);
  }
  async function choose(index) {
    const card = `[data-image-id="issue177-${String(index).padStart(3, '0')}"]`;
    for (let attempt = 0; attempt < 10; attempt++) {
      const position = await page.evaluate((selector) => {
        const main = document.querySelector('main');
        const rect = main.getBoundingClientRect();
        return {
          present: !!document.querySelector(selector),
          top: main.scrollTop,
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          delta: main.clientHeight * 0.8,
        };
      }, card);
      if (position.present) break;
      await page.mouse.move(position.x, position.y);
      await page.mouse.wheel(0, position.delta);
      await page.waitForFunction(
        ({ selector, top }) =>
          !!document.querySelector(selector) ||
          document.querySelector('main').scrollTop > top,
        { selector: card, top: position.top },
      );
    }
    await page.hover(card);
    await page.click(`${card} label:has(input[type="checkbox"])`);
  }
  async function version(value) {
    await page.click('[data-testid="library-copy-version"]');
    await page.waitForSelector(`loc=role:option[name="${copyNames[value]}"]`);
    await page.click(`loc=role:option[name="${copyNames[value]}"]`);
  }
  async function selectFormat(value, keyboard = false) {
    const selector = `[data-copy-format="${value}"]`;
    if (keyboard) {
      // React Aria restores the last focused item when entering the group.
      // Enter with Tab, then use its supported horizontal arrow navigation.
      await page.focus('[data-testid="library-copy-version"]');
      await page.keyboard.press('Tab');
      const formats = ['url', 'markdown', 'html'];
      const activeFormat = await page.evaluate(() =>
        document.activeElement?.getAttribute('data-copy-format'),
      );
      assert.ok(
        formats.includes(activeFormat),
        'Tab from the version selector enters the format group',
      );
      const distance = formats.indexOf(value) - formats.indexOf(activeFormat);
      for (let step = 0; step < Math.abs(distance); step++)
        await page.keyboard.press(distance > 0 ? 'ArrowRight' : 'ArrowLeft');
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.getAttribute('data-copy-format'),
        ),
        value,
        'Arrow navigation focuses the requested format',
      );
      await page.keyboard.press('Space');
    } else await page.click(selector);
    assert.equal(
      await page.evaluate(
        (selector) =>
          document.querySelector(selector)?.getAttribute('aria-checked'),
        selector,
      ),
      'true',
    );
  }
  async function format(value, keyboard = false) {
    await selectFormat(value, keyboard);
    await page.click('[data-testid="library-copy-submit"]');
  }
  async function monitor(mode = 'reverse') {
    await page.evaluate((mode) => {
      const original = window.__copyOriginalFetch ?? window.fetch;
      window.__copyOriginalFetch = original;
      const native =
        window.__copyNativeWrite ??
        navigator.clipboard.writeText.bind(navigator.clipboard);
      window.__copyNativeWrite = native;
      window.__copyTraffic = [];
      window.__copyWrites = [];
      window.__copyRelease = null;
      navigator.clipboard.writeText = async (text) => {
        window.__copyWrites.push(text);
        await native(text);
      };
      performance.clearResourceTimings();
      window.fetch = async (...args) => {
        const url = new URL(
          typeof args[0] === 'string' ? args[0] : args[0].url,
          location.href,
        );
        if (url.pathname !== '/api/images/copy') return original(...args);
        const request = JSON.parse(args[1].body);
        const row = { request };
        window.__copyTraffic.push(row);
        const response = await original(...args);
        row.status = response.status;
        row.response = await response.clone().json();
        if (response.status === 401)
          sessionStorage.setItem(
            'ariso:issue187-copy-auth',
            JSON.stringify({
              status: response.status,
              code: row.response.code,
              cacheControl: response.headers.get('cache-control'),
              writes: window.__copyWrites.length,
            }),
          );
        if (mode === 'hold') {
          mode = 'reverse';
          await new Promise((resolve) => {
            window.__copyRelease = resolve;
          });
        }
        if (mode === 'http-error') {
          const status = 503;
          return new Response(
            JSON.stringify({
              code: 'INTERNAL_SERVER_ERROR',
              message: `浏览器验证 HTTP ${status}`,
            }),
            {
              status,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
              },
            },
          );
        }
        if (response.ok)
          return new Response(
            JSON.stringify({
              ...row.response,
              items: [...row.response.items].reverse(),
              unavailable: [...row.response.unavailable].reverse(),
            }),
            { status: response.status, headers: response.headers },
          );
        return response;
      };
    }, mode);
  }
  const traffic = () => page.evaluate(() => window.__copyTraffic);
  async function completed() {
    await page.waitForFunction(() => {
      const dialog = document.querySelector(
        '[data-testid="library-copy-dialog"]',
      );
      return dialog
        ? dialog.querySelector('[data-testid="library-copy-submit"]')
            ?.disabled === false &&
            !!dialog.querySelector('[data-testid="library-copy-feedback"]')
        : window.__copyWrites?.length === 1;
    });
    await batch.settle();
    assert.equal(
      await page.evaluate(
        () => !!document.querySelector('[data-testid="library-copy-result"]'),
      ),
      false,
      'Copy keeps the original list instead of replacing it with a result page',
    );
  }
  async function again() {
    if (
      !(await page.evaluate(
        () => !!document.querySelector('[data-testid="library-copy-dialog"]'),
      ))
    ) {
      const count = await page.evaluate(() =>
        Number(
          document
            .querySelector('[data-testid="library-selection"] button')
            ?.getAttribute('aria-label')
            ?.match(/\d+/)?.[0],
        ),
      );
      await open(count);
    }
  }
  async function verifyNative(expected) {
    await page.waitForFunction(() => window.__copyWrites.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__copyWrites), [
      expected,
    ]);
    await verifyPasteboard(expected);
  }
  async function verifyPasteboard(expected) {
    const { stdout } = await run('pbpaste', [], { encoding: 'utf8' });
    assert.equal(
      stdout,
      expected,
      'Native pasteboard contains the complete exact output',
    );
  }
  async function noImageReads() {
    const paths = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => new URL(entry.name).pathname)
        .filter((path) => path.startsWith('/i/') || path.includes('/preview')),
    );
    assert.deepEqual(
      paths,
      [],
      'Generating links never fetches image bytes or preview URLs',
    );
  }
  async function capture(
    state,
    widths = [360, 390, 430, 768, 1440],
    short = false,
  ) {
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      for (const width of widths) {
        await resizeViewport(page, width, short ? 400 : undefined);
        await batch.settle();
        const geometry = await page.evaluate(() => {
          const surface =
            document
              .querySelector('[data-testid="library-copy-manual"]')
              ?.closest('[role="dialog"]') ??
            document.querySelector(
              '[data-testid="library-copy-dialog"],[data-testid="library-copy-result"]',
            );
          const rect = (node) => node.getBoundingClientRect().toJSON();
          const controls = [
            ...surface.querySelectorAll('button,[role="combobox"],textarea'),
            ...document.querySelectorAll(
              'footer [data-testid^="library-copy-"]',
            ),
          ]
            .filter(
              (node) =>
                node.getClientRects().length &&
                !node.closest('[inert],[aria-hidden="true"]') &&
                getComputedStyle(node).clip !== 'rect(0px, 0px, 0px, 0px)' &&
                getComputedStyle(node).clipPath !== 'inset(50%)',
            )
            .map((node) => ({
              name: node.getAttribute('aria-label') || node.textContent.trim(),
              ...rect(node),
            }));
          return {
            width: innerWidth,
            height: innerHeight,
            overflow: document.documentElement.scrollWidth > innerWidth,
            surface: rect(surface),
            controls,
            formats: [...surface.querySelectorAll('[data-copy-format]')].map(
              (node) => ({ value: node.dataset.copyFormat, ...rect(node) }),
            ),
            focusedWithin: surface.contains(document.activeElement),
          };
        });
        assert.equal(
          geometry.overflow,
          false,
          `${state}/${theme}/${width} horizontal overflow`,
        );
        assert.ok(
          geometry.surface.x >= 0 && geometry.surface.right <= width + 1,
        );
        if (geometry.formats.length) {
          const widths = geometry.formats.map((node) => node.width);
          assert.ok(
            Math.max(...widths) - Math.min(...widths) <= 1,
            'Visible format controls fill equal grid columns',
          );
          assert.ok(
            geometry.formats.every((node) => node.height === 44),
            'Approved prototype has 44px inner format controls',
          );
        }
        for (const control of geometry.controls)
          assert.ok(
            control.width >= (width >= 1200 ? 24 : 43) &&
              control.height >= (width >= 1200 ? 24 : 43),
            `${state}: ${control.name} keeps the required click target (${control.width}x${control.height})`,
          );
        if (short)
          assert.ok(
            geometry.surface.bottom <= 401,
            'Short viewport surface stays reachable',
          );
        const screenshot = [390, 1440].includes(width)
          ? `library-copy-${state}-${theme}-${width}${short ? '-short' : ''}.png`
          : null;
        if (screenshot)
          await page.screenshot({ path: join(config.output, screenshot) });
        report.layouts.push({ state, theme, screenshot, ...geometry });
      }
    }
    await resizeViewport(page, 1440);
  }
  return {
    ...batch,
    choose,
    open,
    version,
    format,
    selectFormat,
    monitor,
    traffic,
    completed,
    again,
    verifyNative,
    verifyPasteboard,
    noImageReads,
    capture,
  };
}

export async function saveClipboard() {
  const { stdout } = await run(
    'osascript',
    [
      '-l',
      'JavaScript',
      '-e',
      `ObjC.import('AppKit'); const p=$.NSPasteboard.generalPasteboard; const rows=[]; const items=p.pasteboardItems; for(let i=0;i<items.count;i++){const item=items.objectAtIndex(i);const row=[];const types=item.types;for(let j=0;j<types.count;j++){const type=types.objectAtIndex(j);row.push({type:ObjC.unwrap(type),data:ObjC.unwrap(item.dataForType(type).base64EncodedStringWithOptions(0))});}rows.push(row);}JSON.stringify(rows);`,
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

export async function restoreClipboard(saved) {
  await run(
    'osascript',
    [
      '-l',
      'JavaScript',
      '-e',
      `ObjC.import('AppKit');const p=$.NSPasteboard.generalPasteboard;p.clearContents;const output=$.NSMutableArray.alloc.init;for(const row of ${JSON.stringify(saved)}){const item=$.NSPasteboardItem.alloc.init;for(const entry of row){item.setDataForType($.NSData.alloc.initWithBase64EncodedStringOptions($(entry.data),0),$(entry.type));}output.addObject(item);}if(output.count)p.writeObjects(output);`,
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );
}
