import assert from 'node:assert/strict';
import { join } from 'node:path';
import { activateDetailMenuAction } from './image-replacement-helpers.mjs';
import {
  resizeViewport,
  setTheme,
  readGeometry,
  assertGeometry,
} from './browser-geometry.mjs';

export const workflowButton = (name) =>
  `loc=role:button[name=${JSON.stringify(name)}]`;
export const detailDialog = '[data-testid="library-detail"]';
export const archiveMenu = '[data-testid="library-archive-menu"]';
export function createImageWorkflowPage(page, config, report, fixture) {
  const listUrl = `${config.origin}/library?${new URLSearchParams({ q: fixture.prefix, page: '1', pageSize: '20' })}`;
  async function visit() {
    await resizeViewport(page, 1440, 1000);
    await page.goto(listUrl);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="library-list"]')?.dataset
          .loadedCount === '4' &&
        document
          .querySelector('[data-testid="library-gallery"]')
          ?.getAttribute('aria-busy') === 'false',
    );
  }
  async function select(image) {
    await page.hover(`[data-image-id="${image.id}"]`);
    await page.click(
      `[data-image-id="${image.id}"] label:has(input[type="checkbox"])`,
    );
  }
  async function selected(count) {
    await page.waitForSelector(workflowButton(`管理选择，已选 ${count} 张`));
  }
  async function openDetail(image) {
    await page.click(workflowButton(`查看图片：${image.displayName}`));
    await page.waitForSelector(detailDialog);
    await page.waitForSelector('[data-testid="detail-body"]');
  }
  async function more(name) {
    return activateDetailMenuAction(page, name, report);
  }
  async function revealWithKeyboard(selector, expectedValue) {
    // Ego's terminal text selector is used only by Page.focus. DOM reads use
    // its native CSS portion and an exact text comparison against the target.
    const terminal = /:text-is\((.+)\)$/.exec(selector);
    const target = {
      css: terminal ? selector.slice(0, terminal.index) : selector,
      text: terminal ? JSON.parse(terminal[1]) : null,
    };
    const read = () =>
      page.evaluate(({ css, text }) => {
        const targets = [...document.querySelectorAll(css)].filter(
          (node) => text === null || node.textContent.trim() === text,
        );
        const node = targets[0],
          active = document.activeElement;
        const describe = (element) => {
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            id: element.id,
            name:
              element.getAttribute('aria-label') ||
              element.textContent?.trim().slice(0, 120),
            value: element.value ?? null,
            readOnly: element.readOnly ?? false,
            disabled: !!element.disabled || element.matches(':disabled'),
            inert: !!element.closest('[inert],[aria-disabled="true"]'),
            rect: {
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            },
          };
        };
        return {
          count: targets.length,
          reached: active === node,
          target: describe(node),
          active: describe(active),
          viewport: { width: innerWidth, height: innerHeight },
        };
      }, target);
    const trace = {
      stage: report.stage,
      selector,
      expectedValue,
      before: await read(),
    };
    (report.focusDiagnostics ??= []).push(trace);
    assert.equal(
      trace.before.count,
      1,
      `${selector} resolves to one actual target`,
    );
    if (trace.before.target.tag === 'TEXTAREA') {
      trace.fieldTab = [];
      for (let step = 0; step <= 10; step++) {
        const current = await read();
        trace.fieldTab.push({ step, ...current });
        if (current.reached) break;
        if (step < 10) await page.keyboard.press('Tab');
      }
    } else await page.focus(selector);
    trace.afterFocus = await read();
    assert.ok(trace.afterFocus.reached, `${selector} actually receives focus`);
    // Establishing focus does not exercise native scrolling after a resize.
    // Real Tab navigation must return to the exact action and reveal it.
    // Read-only fields already use their natural Tab order above.
    if (['BUTTON', 'A'].includes(trace.afterFocus.target.tag)) {
      await page.keyboard.press('Shift+Tab');
      trace.afterShiftTab = await read();
      await page.keyboard.press('Tab');
      trace.afterTab = await read();
      assert.ok(
        trace.afterTab.reached,
        'Native Tab returns to the same requested action',
      );
    }
    try {
      await page.waitForFunction(({ css, text }) => {
        const node = [...document.querySelectorAll(css)].find(
          (item) => text === null || item.textContent.trim() === text,
        );
        if (!node || document.activeElement !== node) return false;
        const rect = node.getBoundingClientRect();
        return (
          rect.top >= 0 &&
          rect.bottom <= innerHeight + 1 &&
          rect.width > 0 &&
          rect.height > 0 &&
          !node.closest('[inert]')
        );
      }, target);
    } finally {
      trace.final = await read();
    }
    assert.ok(
      !trace.final.target.disabled && !trace.final.target.inert,
      'The focused field or action remains available',
    );
    if (expectedValue !== undefined) {
      assert.equal(
        trace.final.target.value,
        expectedValue,
        'The actual focused link field contains the complete expected URL',
      );
      assert.equal(
        trace.final.target.readOnly,
        true,
        'The focused link field is read-only',
      );
    }
    return trace.final.target;
  }
  async function capture(
    scene,
    container,
    submit,
    widths = [1440, 390],
    themes = ['light', 'dark'],
  ) {
    const extraWidths = [360, 430, 768].filter(
      (width) => !widths.includes(width),
    );
    for (const width of [...widths, ...extraWidths])
      for (const theme of extraWidths.includes(width) ? ['light'] : themes) {
        report.stage = `${scene}-${width}-${theme}-capture`;
        await resizeViewport(page, width, width < 768 ? 844 : 1000);
        await setTheme(page, theme);
        await page.waitForSelector(container);
        await page.evaluate(() => document.fonts.ready);
        let primaryFocus;
        if (submit && extraWidths.includes(width)) {
          await revealWithKeyboard(submit);
          primaryFocus = await page.evaluate((selector) => {
            const active = document.activeElement;
            const rect = active.getBoundingClientRect();
            const dialog = document
              .querySelector(selector)
              ?.closest('[role="dialog"]');
            return {
              width: rect.width,
              height: rect.height,
              top: rect.top,
              bottom: rect.bottom,
              viewport: innerHeight,
              withinDialog: !dialog || dialog.contains(active),
              inert: !!active.closest('[inert]'),
              name: active.getAttribute('aria-label') || active.textContent,
            };
          }, container);
          assert.ok(
            primaryFocus.width >= 44 &&
              primaryFocus.height >= 44 &&
              primaryFocus.top >= 0 &&
              primaryFocus.bottom <= primaryFocus.viewport + 1 &&
              primaryFocus.withinDialog &&
              !primaryFocus.inert,
            `${scene} ${width}px primary action is reachable with keyboard focus`,
          );
        }
        const geometry = await readGeometry(page);
        assertGeometry(geometry, `${scene} ${width} ${theme}`);
        const screenshot = `image-workflows-${scene}-${theme}-${width}.png`;
        await page.screenshot({ path: join(config.output, screenshot) });
        report.layouts.push({
          scene,
          theme,
          width,
          height: width < 768 ? 844 : 1000,
          screenshot,
          geometry,
          ...(primaryFocus ? { primaryFocus } : {}),
        });
      }
    if (submit) {
      report.stage = `${scene}-390x400-primary-focus`;
      await resizeViewport(page, 390, 400);
      const focusedControl = await revealWithKeyboard(submit);
      const target = await page.evaluate((selector) => {
        const element = document.activeElement,
          rect = element.getBoundingClientRect();
        const dialog = document
          .querySelector(selector)
          ?.closest('[role="dialog"]');
        return {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          bottom: rect.bottom,
          viewport: innerHeight,
          withinDialog: !dialog || dialog.contains(element),
          inert: !!element.closest('[inert]'),
        };
      }, container);
      assert.ok(
        target.width >= 44 && target.height >= 44,
        `${scene} short-screen primary action has a 44px target`,
      );
      assert.ok(
        target.top >= 0 &&
          target.bottom <= target.viewport + 1 &&
          target.withinDialog &&
          !target.inert,
        `${scene} short-screen primary action can be reached`,
      );
      const screenshot = `image-workflows-${scene}-short-390x400.png`;
      await page.screenshot({ path: join(config.output, screenshot) });
      report.layouts.push({
        scene,
        width: 390,
        height: 400,
        screenshot,
        target,
        focusedControl,
      });
    }
    await resizeViewport(page, 1440, 1000);
    await setTheme(page, 'light');
  }
  async function modalKeyboard(container, control) {
    await page.focus(control);
    for (let index = 0; index < 4; index++) {
      await page.keyboard.press('Tab');
      assert.equal(
        await page.evaluate(
          (selector) => !!document.activeElement?.closest(selector),
          container,
        ),
        true,
        'Keyboard focus remains in the actual modal',
      );
    }
  }
  async function captureMobileForm(scene, controls) {
    for (const width of [390, 360, 430, 768]) {
      await resizeViewport(page, width, width < 768 ? 844 : 1000);
      for (const theme of width === 390 ? ['light', 'dark'] : ['light']) {
        await setTheme(page, theme);
        for (const [part, selector, expectedValue] of controls) {
          report.stage = `${scene}-form-${part}-${width}-${theme}-focus`;
          // Native focus scrolls the real modal body to its actual form controls.
          await revealWithKeyboard(selector, expectedValue);
          await page.waitForFunction(() => {
            const target = document.activeElement?.getBoundingClientRect();
            return (
              target && target.top >= 0 && target.bottom <= innerHeight + 1
            );
          });
          const focused = await page.evaluate(() => {
            const target = document.activeElement;
            const rect = target.getBoundingClientRect();
            return {
              name: target.getAttribute('aria-label') || target.textContent,
              value: target.value ?? null,
              top: rect.top,
              bottom: rect.bottom,
            };
          });
          const geometry = await readGeometry(page);
          assertGeometry(geometry, `${scene} form ${part} ${width} ${theme}`);
          const screenshot = `image-workflows-${scene}-form-${part}-${theme}-${width}.png`;
          await page.screenshot({ path: join(config.output, screenshot) });
          report.layouts.push({
            scene: `${scene}-form`,
            part,
            theme,
            width,
            height: width < 768 ? 844 : 1000,
            screenshot,
            focused,
            geometry,
          });
        }
      }
    }
    await resizeViewport(page, 1440, 1000);
    await setTheme(page, 'light');
  }
  async function sourcePreview(image, role, container = detailDialog) {
    await page.waitForFunction(
      ({ id, role, container }) =>
        [
          ...document.querySelectorAll(
            `${container} [data-testid="detail-preview"]`,
          ),
        ]
          .filter(
            (node) => node.getClientRects().length && !node.closest('[inert]'),
          )
          .some((node) => {
            const src = new URL(node.currentSrc || node.src, location.href);
            return (
              src.pathname === `/i/${id}` &&
              src.searchParams.get('type') === role &&
              node.complete &&
              node.naturalWidth > 0
            );
          }),
      { id: image.id, role, container },
    );
    report.checks.push({
      scenario: 'owner-workflow-preview-role',
      imageId: image.id,
      role,
    });
  }
  return {
    listUrl,
    visit,
    select,
    selected,
    openDetail,
    more,
    capture,
    modalKeyboard,
    captureMobileForm,
    sourcePreview,
  };
}
