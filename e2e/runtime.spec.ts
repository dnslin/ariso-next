import { expect, test } from '@playwright/test';

test.use({ baseURL: 'http://127.0.0.1:3000' });

test('@smoke 简体中文工程状态页与本地资源可访问', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page).toHaveTitle('Ariso · 工程状态');
  await expect(
    page.getByRole('heading', { name: '运行基础建设中' }),
  ).toBeVisible();
  await expect(
    page.getByText('账号初始化、登录和图片上传尚未开放。'),
  ).toBeVisible();

  const resource = await request.get('/runtime.svg');
  expect(resource.status()).toBe(200);
  expect(resource.headers()['content-type']).toContain('image/svg+xml');
  await expect(page.locator('img')).toHaveJSProperty('complete', true);
  expect(
    await page
      .locator('img')
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBe(64);

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole('heading', { name: '运行基础建设中' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
