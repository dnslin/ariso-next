import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readGeometry } from './browser-geometry.mjs';

/** Relation-specific targets keep the stricter upload sizing rules. */
export async function captureRelationLayout(
  { page, config, report },
  name,
  width,
  theme,
  height = width >= 1200 ? 1080 : 844,
) {
  if (width >= 768) {
    await page.waitForFunction(() =>
      [
        ...document.querySelectorAll(
          '[data-testid="upload-create-tag"] [data-slot="modal-footer"] button[data-slot="button"]',
        ),
      ].every((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width === 116 && rect.height === 40;
      }),
    );
  }
  const geometry = await readGeometry(page);
  const searchHitAreas = [];
  for (const label of ['搜索相册', '搜索标签']) {
    if (!geometry.targets.some((target) => target.name === label)) continue;
    const hitArea = await page.evaluate((label) => {
      const input = document.querySelector(`input[aria-label="${label}"]`);
      const group = input.closest('[data-slot="search-field-group"]');
      const inputRect = input.getBoundingClientRect();
      const groupRect = group.getBoundingClientRect();
      const previous = document.activeElement;
      window.__restoreRelationLayoutFocus = () => {
        if (previous === document.body) document.activeElement?.blur();
        else previous?.focus();
        delete window.__restoreRelationLayoutFocus;
      };
      return {
        label,
        input: { width: inputRect.width, height: inputRect.height },
        group: { width: groupRect.width, height: groupRect.height },
        hitTarget:
          inputRect.width >= 44 && inputRect.height >= 44 ? 'input' : 'group',
        hits: [],
      };
    }, label);
    searchHitAreas.push(hitArea);
    report.searchHitAreas ??= [];
    report.searchHitAreas.push({ name, theme, width, height, ...hitArea });
    const kind = label === '搜索相册' ? '相册' : '标签';
    try {
      for (const edge of ['top', 'bottom']) {
        // Move focus away first so an inert margin cannot accidentally pass.
        await page.focus(`loc=role:button[name="新建${kind}"]`);
        await page.waitForFunction(
          (label) =>
            document.activeElement !==
            document.querySelector(`input[aria-label="${label}"]`),
          label,
        );
        const point = await page.evaluate(
          ({ label, edge, hitTarget }) => {
            const input = document.querySelector(
              `input[aria-label="${label}"]`,
            );
            const group = input.closest('[data-slot="search-field-group"]');
            const rect = group.getBoundingClientRect();
            const inputRect = input.getBoundingClientRect();
            const x = inputRect.left + inputRect.width / 2;
            const y =
              hitTarget === 'input'
                ? edge === 'top'
                  ? inputRect.top + 2
                  : inputRect.bottom - 2
                : edge === 'top'
                  ? (rect.top + inputRect.top) / 2
                  : (inputRect.bottom + rect.bottom) / 2;
            return {
              edge,
              x,
              y,
              outsideInput:
                edge === 'top' ? y < inputRect.top : y > inputRect.bottom,
              groupHit: document.elementFromPoint(x, y) === group,
              inputHit: document.elementFromPoint(x, y) === input,
              inViewport:
                x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight,
            };
          },
          { label, edge, hitTarget: hitArea.hitTarget },
        );
        hitArea.hits.push(point);
        assert.equal(
          point.inViewport,
          true,
          `${label}: ${edge} search group margin is reachable`,
        );
        if (hitArea.hitTarget === 'group')
          assert.equal(
            point.outsideInput,
            true,
            `${label}: ${edge} hit is outside the smaller input`,
          );
        assert.equal(
          hitArea.hitTarget === 'group' ? point.groupHit : point.inputHit,
          true,
          `${label}: ${edge} hits the actual ${hitArea.hitTarget}`,
        );
        await page.mouse.click(point.x, point.y, {
          label: `focus search at ${edge} margin`,
        });
        const focused = await page.evaluate(
          (label) =>
            document.activeElement ===
            document.querySelector(`input[aria-label="${label}"]`),
          label,
        );
        point.inputFocused = focused;
        assert.equal(
          focused,
          true,
          `${label}: actual ${edge} margin click focuses the search input`,
        );
      }
    } finally {
      await page.evaluate(() => window.__restoreRelationLayoutFocus());
    }
  }
  const footer = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[data-testid="upload-create-tag"] [data-slot="modal-footer"] button[data-slot="button"]',
      ),
    ].map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        name: node.getAttribute('aria-label') || node.textContent,
        width: rect.width,
        height: rect.height,
      };
    }),
  );
  assert.equal(geometry.overflow, false, `${name}: document overflow`);
  assert.equal(geometry.mainOverflow, false, `${name}: main overflow`);
  for (const target of geometry.targets) {
    const tagFooter = footer.some((action) => action.name === target.name);
    // Smaller SearchField inputs expose their separately hit-tested group.
    // Keep the original input rectangles in geometry; every other target stays strict.
    const search = searchHitAreas.find((area) => area.label === target.name);
    const hitTarget = search?.hitTarget === 'group' ? search.group : target;
    assert.ok(
      hitTarget.width >= 44 &&
        hitTarget.height >=
          ((width >= 768 && tagFooter) || (width >= 1200 && target.navigation)
            ? 40
            : 44),
      `${target.name}: click target (${hitTarget.width}×${hitTarget.height})`,
    );
    if (width >= 768 && tagFooter) {
      assert.equal(
        target.width,
        116,
        `${target.name}: Figma desktop tag footer width`,
      );
      assert.equal(
        target.height,
        40,
        `${target.name}: Figma desktop tag footer height`,
      );
    }
  }
  const path = join(
    config.output,
    `relations-${name}-${theme}-${width}${height === 400 ? '-short' : ''}.png`,
  );
  await page.screenshot({ path });
  report.layouts.push({
    name,
    theme,
    path,
    height,
    tagFooter: footer,
    searchHitAreas,
    ...geometry,
  });
}
