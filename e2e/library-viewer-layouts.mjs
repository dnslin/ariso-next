import assert from 'node:assert/strict';
import {
  setDetail171Theme,
  setDetail171Viewport,
} from './library-detail-171-helpers.mjs';
import { viewerId } from './library-viewer-fixtures.mjs';
import {
  closeViewer,
  openViewerDirect,
  viewer,
  viewerShot,
  settleViewer,
  waitViewerImage,
  waitViewerOverlayStable,
} from './library-viewer-helpers.mjs';

export async function verifyViewerLayouts(
  context,
  state = 'ready',
  representative = false,
) {
  const { page, config, report } = context;
  for (const theme of ['light', 'dark']) {
    await setDetail171Theme(page, theme);
    for (const width of representative
      ? [1440, 390]
      : [360, 390, 430, 768, 1440]) {
      await setDetail171Viewport(page, width);
      await settleViewer(page);
      await waitViewerOverlayStable(page);
      const geometry = await page.evaluate((selector) => {
        const root = document.querySelector(selector);
        const rect = root.getBoundingClientRect();
        const visible = (node) => {
          if (
            !node.getClientRects().length ||
            node.closest('[aria-hidden="true"],[inert]')
          )
            return false;
          for (
            let ancestor = node;
            ancestor;
            ancestor = ancestor.parentElement
          ) {
            const style = getComputedStyle(ancestor);
            if (
              style.visibility === 'hidden' ||
              style.clip === 'rect(0px, 0px, 0px, 0px)' ||
              style.clipPath === 'inset(50%)'
            )
              return false;
          }
          return true;
        };
        const font = (node) => {
          if (!node) return null;
          const style = getComputedStyle(node);
          return {
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
          };
        };
        const hint = [...root.querySelectorAll('p')].find(
          (node) =>
            /滚轮缩放|双指缩放/.test(node.textContent) &&
            node.getClientRects().length,
        );
        return {
          width: innerWidth,
          height: innerHeight,
          documentOverflow: document.documentElement.scrollWidth > innerWidth,
          overflow: root.scrollWidth > root.clientWidth,
          fonts: {
            heading: font(root.querySelector('h1')),
            currentVersion: font(
              root.querySelector('[data-testid="viewer-current-version"]'),
            ),
            hint: font(hint),
            tabs: [...root.querySelectorAll('[role="tab"]')].map((node) => ({
              name: node.textContent.trim(),
              ...font(node),
            })),
            close: font(root.querySelector('button[aria-label="关闭大图"]')),
            footerButtons: [
              ...root.querySelectorAll('[data-testid="viewer-footer"] button'),
            ].map((node) => ({ name: node.textContent.trim(), ...font(node) })),
            placeholder: font(
              root.querySelector(
                '.yarl__slide_current [data-testid="viewer-placeholder"] p',
              ),
            ),
          },
          rect: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          },
          targets: [...root.querySelectorAll('button,[role="tab"],a')]
            .filter(visible)
            .map((node) => {
              const bounds = node.getBoundingClientRect();
              return {
                name:
                  node.getAttribute('aria-label') || node.textContent.trim(),
                width: bounds.width,
                height: bounds.height,
                inViewport:
                  bounds.left >= -1 &&
                  bounds.top >= -1 &&
                  bounds.right <= innerWidth + 1 &&
                  bounds.bottom <= innerHeight + 1,
              };
            }),
          versions: [...root.querySelectorAll('[role="tab"]')].map((node) => ({
            text: node.textContent.trim(),
            selected: node.getAttribute('aria-selected'),
            disabled: node.getAttribute('aria-disabled'),
          })),
        };
      }, viewer);
      assert.equal(
        geometry.documentOverflow,
        false,
        `${state}/${theme}/${width}: document overflow`,
      );
      assert.equal(
        geometry.overflow,
        false,
        `${state}/${theme}/${width}: viewer overflow`,
      );
      assert.ok(
        Math.abs(geometry.rect.left) <= 1 &&
          Math.abs(geometry.rect.top) <= 1 &&
          Math.abs(geometry.rect.right - width) <= 1 &&
          Math.abs(geometry.rect.bottom - geometry.height) <= 1,
        'Viewer occupies the real viewport',
      );
      assert.deepEqual(
        geometry.versions.map((item) => item.text),
        ['原图', '压缩图', '缩略图', '水印图'],
      );
      for (const target of geometry.targets) {
        assert.ok(
          target.width >= 44 && target.height >= 44,
          `${target.name}: 44px target`,
        );
        assert.equal(
          target.inViewport,
          true,
          `${target.name}: visible within viewport`,
        );
      }
      await viewerShot(page, config, report, `${state}-${theme}-${width}`);
      report.layouts.push({ state: `viewer-${state}`, theme, ...geometry });
    }
  }
}

export async function verifyViewerShortViewport({ page, config, report }) {
  for (const width of [390, 1440]) {
    await setDetail171Viewport(page, width, 400);
    await settleViewer(page);
    await waitViewerOverlayStable(page);
    const controls = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="image-viewer"] button')]
        .filter(
          (node) =>
            node.getClientRects().length &&
            !node.closest('[aria-hidden="true"]'),
        )
        .map((node) => ({
          name: node.getAttribute('aria-label') || node.textContent.trim(),
          top: node.getBoundingClientRect().top,
          bottom: node.getBoundingClientRect().bottom,
        })),
    );
    for (const control of controls)
      assert.ok(
        control.top >= 0 && control.bottom <= 400,
        `${control.name}: short viewport control remains reachable`,
      );
    await viewerShot(page, config, report, `short-${width}`);
  }
  report.checks.push(
    'Viewer ready state uses five real viewport widths in light/dark; phone controls have 44px targets; 390/1440×400 keeps close, version and bottom controls reachable. Screenshots require independent Figma comparison and do not themselves establish design approval.',
  );
}

export async function verifyViewerLongName({ page, config, report }) {
  const id = viewerId(0);
  const endpoint = `/api/images/${id}`;
  const response = await page.fetch(endpoint);
  assert.equal(response.status, 200);
  const before = JSON.parse(response.body);
  const longName = '图'.repeat(255);
  const patch = (displayName) =>
    page.fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName }),
    });
  try {
    assert.equal((await patch(longName)).status, 200);
    await setDetail171Viewport(page, 360, 400);
    await openViewerDirect(page, config, id);
    await waitViewerImage(page, id, 'compressed');
    const geometry = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="image-viewer"]');
      const heading = root.querySelector('h1');
      return {
        width: innerWidth,
        height: innerHeight,
        heading: {
          text: heading.textContent,
          height: heading.getBoundingClientRect().height,
        },
        targets: [
          ...root.querySelectorAll(
            'button[aria-label="关闭大图"],button[aria-label="全屏"],[role="tab"],[data-testid="viewer-footer"] button',
          ),
        ].map((node) => {
          const rect = node.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return {
            name: node.getAttribute('aria-label') || node.textContent.trim(),
            disabled:
              node.disabled || node.getAttribute('aria-disabled') === 'true',
            width: rect.width,
            height: rect.height,
            top: rect.top,
            bottom: rect.bottom,
            inViewport:
              rect.left >= 0 &&
              rect.top >= 0 &&
              rect.right <= innerWidth &&
              rect.bottom <= innerHeight,
            reachable: node === hit || node.contains(hit),
          };
        }),
      };
    });
    report.longName = geometry;
    await viewerShot(page, config, report, 'long-name-360-short');
    assert.equal(geometry.heading.text, longName);
    for (const target of geometry.targets) {
      assert.ok(
        target.width >= 44 && target.height >= 44,
        `${target.name}: long-name 44px target`,
      );
      assert.equal(
        target.inViewport,
        true,
        `${target.name}: 255-character name leaves control in the short viewport`,
      );
      if (!target.disabled)
        assert.equal(
          target.reachable,
          true,
          `${target.name}: long-name control receives pointer input`,
        );
    }
    await closeViewer(page, true);
    report.checks.push(
      'A real owner PATCH accepts a 255-character Chinese display name. At 360×400 close, versions and footer controls remain visible and receive pointer input; disabled boundaries remain visible, and Escape still closes. The original name is restored.',
    );
  } finally {
    assert.equal((await patch(before.displayName)).status, 200);
  }
}
