import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  resizeViewport,
  setTheme,
  readGeometry,
  assertGeometry,
} from './browser-geometry.mjs';
import { waitForSharingScrollStable } from './sharing-public-feedback.mjs';

/** Approved layouts and access Tips; scenario actions never depend on screenshot labels. */
export function createSharingPublicLayouts({ page, config, report }) {
  const record = (scenario, detail = {}) =>
    report.checks.push({ scenario, ...detail });

  async function readAccessTips(width) {
    await page.waitForSelector('[role="dialog"][aria-label="访问说明"]');
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
      'Access Tips fit the real viewport',
    );
    return help;
  }
  async function closeAccessTips() {
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
  async function capture(
    name,
    widths = [1440, 390],
    themes = ['light', 'dark'],
    sample = {},
  ) {
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
        assert.ok(
          geometry.targets.length > 0,
          'The public home exit is visible',
        );
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
              document
                .querySelector('main')
                .textContent.split('暂无可展示的图片').length - 1,
            zeroCount:
              document
                .querySelector('[data-share-scroll] header p:last-child')
                ?.textContent.replace(/\s/g, '') === '0张图片',
            centered:
              iconRect && textRect
                ? {
                    horizontal:
                      (iconRect.left +
                        iconRect.right -
                        rect.left -
                        rect.right) /
                      2,
                    vertical:
                      (iconRect.top +
                        textRect.bottom -
                        rect.top -
                        rect.bottom) /
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
        const stateGeometry = await sample.inspect?.(width);
        try {
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
            ...stateGeometry,
          });
        } finally {
          await sample.finish?.();
        }
      }
    }
  }
  async function passwordHelp(state) {
    const trigger = 'button[aria-label="查看访问说明"]';
    const dialog = '[role="dialog"][aria-label="访问说明"]';
    const url = await page.url();
    const initial = await page.evaluate(() => ({
      value: document.querySelector('[data-testid="share-password-input"]')
        .value,
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
      await capture(
        `${state}-help`,
        [360, 390, 430, 768, 1440],
        ['light', 'dark'],
        {
          async inspect(width) {
            await page.click(trigger);
            return {
              helpGeometry: await readAccessTips(width),
              geometryContext: 'Underlying form before access Tips open',
            };
          },
          finish: closeAccessTips,
        },
      );
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
          await waitForSharingScrollStable(page);
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
          await waitForSharingScrollStable(page);
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
          report.shortPasswordScrollChecks ??= [];
          report.shortPasswordScrollChecks.push({
            state,
            width,
            height,
            theme,
            ...short,
          });
          try {
            assert.ok(
              short.scroll > 0,
              'The short password page actually scrolls',
            );
            assert.ok(
              short.top >= 0 && short.bottom <= short.viewport,
              'Real scrolling reaches the entire primary action',
            );
          } catch (error) {
            await page.screenshot({
              path: join(
                config.output,
                `sharing-public-${state}-scroll-failure-${theme}-390x420.png`,
              ),
            });
            throw error;
          }
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
          const help = await readAccessTips(width);
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
            value: document.querySelector(
              '[data-testid="share-password-input"]',
            ).value,
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

  return { capture, passwordHelp };
}
