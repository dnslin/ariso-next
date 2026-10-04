import assert from 'node:assert/strict';

export async function verifyFilterConsumers(context) {
  const { page, sql, config, report, resize, button, screenshot } = context;
  report.activeCheck = 'approved-filter-consumers';
  await sql(
    "UPDATE media_images SET trashed_at=NULL WHERE id LIKE 'issue177-%'",
  );
  await sql(
    "INSERT INTO image_tags (image_id,tag_id) VALUES ('issue177-000','issue177-tag-a')",
  );
  const [storage] = await sql(
    "SELECT id,name FROM storage_configs WHERE enabled=1 AND type='local' LIMIT 1",
  );
  for (const { path, active } of [
    { path: '/library', active: '/library' },
    { path: '/albums/issue177-album-a', active: '/albums' },
  ]) {
    await page.goto(`${config.origin}${path}`);
    await page.waitForSelector('[data-testid="library-list"]');
    for (const width of [1440, 390]) {
      await resize(width);
      for (const { category, label, search, option, queryKey, value } of [
        {
          category: 'storages',
          label: '存储位置',
          search: storage.name,
          option: storage.name,
          queryKey: 'storageId',
          value: storage.id,
        },
        {
          category: 'tags',
          label: '标签',
          search: 'Issue 177 标签 A',
          option: 'Issue 177 标签 A',
          queryKey: 'tagId',
          value: 'issue177-tag-a',
        },
      ]) {
        if (
          !(await page.evaluate(
            (category) =>
              !!document.querySelector(`[data-filter-category="${category}"]`),
            category,
          ))
        ) {
          await page.click(button('添加条件'));
          await page.click(`loc=role:menuitem[name="${label}"]`);
        }
        const trigger = `[data-filter-category="${category}"] button[aria-haspopup]`;
        const geometry = await page.evaluate((selector) => {
          const control = document.querySelector(selector);
          return {
            height: control.getBoundingClientRect().height,
            text: control.closest('[data-filter-category]').textContent,
          };
        }, trigger);
        assert.equal(geometry.height, 44);
        assert.ok(
          geometry.text.includes(category === 'tags' ? '标签' : '存储位置'),
        );
        await page.click(trigger);
        await page.fill('input[placeholder="输入名称搜索"]', search);
        await page.waitForSelector(`loc=role:option[name="${option}"]`);
        await page.click(`loc=role:option[name="${option}"]`);
        if (category === 'tags') await page.keyboard.press('Escape');
        await page.waitForFunction(
          ({ queryKey, value }) =>
            new URL(location.href).searchParams
              .getAll(queryKey)
              .includes(value),
          { queryKey, value },
        );
      }
      assert.ok(
        await page.evaluate(
          (active) =>
            [
              ...document.querySelectorAll(
                '.shell-navigation [aria-current="page"]',
              ),
            ].some((link) => new URL(link.href).pathname === active),
          active,
        ),
      );
      await screenshot(
        `approved-consumer-${active.slice(1)}`,
        width,
        width === 1440 ? 'light' : 'dark',
      );
      // Repeat the menu interaction at the other viewport from the same clean route.
      if (width === 1440) {
        await page.goto(`${config.origin}${path}`);
        await page.waitForSelector('[data-testid="library-list"]');
      }
    }
  }
  report.checks.push(
    '图库及相册详情实际回归：桌面/手机默认condition控件仍44px，存储/标签菜单真实查询与选择正常，公共当前导航正确。',
  );
}
