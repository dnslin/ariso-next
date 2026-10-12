import assert from 'node:assert/strict';

export async function verifySelectAppearance(page, report, route) {
  const controls = await page.evaluate(() =>
    [...document.querySelectorAll('.select__trigger')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !node.disabled;
      })
      .map((node) => ({
        id: node.id,
        radius: getComputedStyle(node).borderRadius,
        value: node.textContent,
      })),
  );
  for (const control of controls) {
    assert.equal(control.radius, '8px', `${route}: select trigger radius`);
    const selector = `[id=${JSON.stringify(control.id)}]`;
    await page.focus(selector);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.select__popover [role="option"]');
    await page.keyboard.press('ArrowDown');
    const menu = await page.evaluate(() => {
      const popover = document.querySelector('.select__popover');
      return {
        mobile: window.innerWidth < 768,
        radius: getComputedStyle(popover).borderRadius,
        options: [...popover.querySelectorAll('[role="option"]')].map(
          (option) => ({
            radius: getComputedStyle(option).borderRadius,
            height: option.getBoundingClientRect().height,
          }),
        ),
      };
    });
    assert.equal(menu.radius, '12px', `${route}: select popup radius`);
    assert.ok(menu.options.length > 0);
    for (const option of menu.options) {
      assert.equal(option.radius, '8px', `${route}: option/focus radius`);
      if (menu.mobile) {
        assert.ok(option.height >= 44, `${route}: option touch target`);
      }
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction((selector) => {
      const trigger = document.querySelector(selector);
      return (
        trigger.getAttribute('aria-expanded') === 'false' &&
        document.activeElement === trigger
      );
    }, selector);
    assert.equal(
      await page.evaluate(
        (selector) => document.querySelector(selector).textContent,
        selector,
      ),
      control.value,
      `${route}: Escape preserves selection`,
    );
    assert.equal(
      await page.evaluate(
        (selector) =>
          document.activeElement === document.querySelector(selector),
        selector,
      ),
      true,
      `${route}: Escape returns focus to trigger`,
    );
    (report.selectAppearance ??= []).push({ route, ...control, menu });
  }
}
