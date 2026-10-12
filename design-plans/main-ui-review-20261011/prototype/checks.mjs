import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function runChecks(task) {
  const page = task.page('p1');
  const routes = [
    '/dashboard',
    '/analytics',
    '/upload',
    '/albums',
    '/trash',
    '/settings/storage',
    '/settings/storage/local',
    '/settings/storage/local/references',
    '/settings/storage/local/maintenance',
    '/analytics?view=usage',
    '/library',
    '/tags',
    '/shares',
    '/settings/general',
  ];
  const cases = [
    ...[1440, 390].flatMap((width) =>
      routes.map((route) => ({ width, route, scenario: 'sample' })),
    ),
    ...['empty', 'attention'].flatMap((scenario) =>
      [
        '/dashboard',
        '/analytics',
        '/upload',
        '/albums',
        '/trash',
        '/settings/storage/local/references',
      ].map((route) => ({ width: 390, route, scenario })),
    ),
    { width: 320, route: '/analytics', scenario: 'sample' },
  ];
  const results = [];
  for (const entry of cases) {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width: entry.width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const url = new URL(entry.route, 'http://127.0.0.1:61510');
    url.searchParams.set('frame', '1');
    url.searchParams.set('scenario', entry.scenario);
    await page.goto(url.href);
    await page.waitForSelector('css:main h1');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('main img')].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    );
    const state = await page.evaluate(() => {
      const main = document.querySelector('main');
      const footer = document.querySelector('footer');
      return {
        title: main.querySelector('h1').textContent,
        overflow: main.scrollWidth > main.clientWidth + 1,
        footerOverflow: footer
          ? footer.scrollWidth > footer.clientWidth + 1
          : false,
        metricOverflow: [
          ...document.querySelectorAll('.prototype-metric'),
        ].some((metric) => metric.scrollWidth > metric.clientWidth + 1),
        brokenImages: [...document.querySelectorAll('main img')].filter(
          (image) => !image.naturalWidth,
        ).length,
        errors: window.__prototypeErrors,
      };
    });
    results.push({ ...entry, ...state });
  }
  const failed = results.filter(
    (result) =>
      result.overflow ||
      result.footerOverflow ||
      result.metricOverflow ||
      result.brokenImages ||
      result.errors.length,
  );
  const output = fileURLToPath(
    new URL('../../../.data/main-ui-review-20261011', import.meta.url),
  );
  await mkdir(output, { recursive: true });
  await writeFile(
    resolve(output, 'browser-checks.json'),
    JSON.stringify(results, null, 2),
  );
  assert.deepEqual(failed, [], 'Prototype layout checks failed');
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.goto('http://127.0.0.1:61510/dashboard?scenario=empty');
  console.log(
    `${results.length} prototype layout checks passed. Evidence: ${output}/browser-checks.json`,
  );
}
