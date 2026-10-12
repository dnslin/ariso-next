import assert from 'node:assert/strict';

export const selectionTrigger = (count) =>
  `loc=role:button[name="管理选择，已选 ${count} 张"]`;

export async function openSelectionManager(page, count) {
  await page.click(selectionTrigger(count));
  await page.waitForSelector('[data-testid="library-selected-panel"]');
}

export async function activateLibraryAction(page, name, count) {
  const button = (label) => `loc=role:button[name="${label}"]`;
  if (name === '查看已选清单') {
    await openSelectionManager(page, count);
    return;
  }
  if (/^(全选|取消.*选择|清空全部选择)/.test(name)) {
    await openSelectionManager(page, count);
    await page.click(button(name));
    if (
      await page.evaluate(
        () =>
          !!document.querySelector('[data-testid="library-selected-panel"]'),
      )
    ) {
      await page.keyboard.press('Escape');
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="library-selected-panel"]'),
      );
    }
    return;
  }
  if (
    ['复制链接', '添加到相册', '添加标签', '恢复所选', '永久删除所选'].includes(
      name,
    )
  ) {
    await page.click(button(name));
    return;
  }
  await page.click(button('更多图片操作'));
  await page.waitForSelector('[role="menu"][aria-label="已选图片操作"]');
  const actions = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[role="menu"][aria-label="已选图片操作"] [role="menuitem"]',
      ),
    ]
      .filter((node) => node.getAttribute('aria-disabled') !== 'true')
      .map((node) => node.textContent.trim()),
  );
  const index = actions.indexOf(name);
  assert.ok(index >= 0, `The actual menu exposes an enabled ${name} action`);
  for (let step = 0; step <= index; step++)
    await page.keyboard.press(step === 0 ? 'Home' : 'ArrowDown');
  await page.waitForFunction((name) => {
    const active = document.activeElement?.closest('[role="menuitem"]');
    const popup = active?.closest('[data-slot="dropdown-popover"]');
    if (active?.textContent.trim() !== name || !popup) return false;
    const item = active.getBoundingClientRect();
    const bounds = popup.getBoundingClientRect();
    return item.top >= bounds.top && item.bottom <= bounds.bottom;
  }, name);
  await page.click(`loc=role:menuitem[name="${name}"]`);
}
