/* global taskSpace */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const task = await taskSpace(36);
const page = task.page('p1');
const samples = JSON.parse(
  await readFile(
    '/Volumes/data/project/ariso/design-plans/share-viewer-review-20261014/samples.json',
    'utf8',
  ),
);
const evidence =
  '/Volumes/data/project/ariso/.data/share-viewer-prototype/evidence';
const results = [];
const image = () =>
  page.evaluate(() =>
    document.querySelector('.yarl__slide_current img')?.getAttribute('src'),
  );
for (const [width, height] of [
  [1440, 1080],
  [390, 844],
  [320, 568],
  [360, 640],
  [430, 932],
  [768, 700],
  [1440, 600],
]) {
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  for (const layout of ['masonry', 'grid']) {
    await page.goto(`http://127.0.0.1:61516/?layout=${layout}`);
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-photo] img').length === 18 &&
        [...document.querySelectorAll('[data-photo] img')].every(
          (i) => i.complete && i.naturalWidth > 0,
        ),
    );
    const before = await page.evaluate(() => {
      const cover = document
        .querySelector('[data-cover]')
        .getBoundingClientRect();
      const gallery = document.querySelector('[data-gallery]');
      return {
        coverTop: cover.top,
        coverHeight: cover.height,
        scrollbar: getComputedStyle(document.documentElement).scrollbarWidth,
        galleryOverflow: getComputedStyle(gallery).overflowY,
        overflow: document.documentElement.scrollWidth > innerWidth,
        bodyHeight: document.documentElement.scrollHeight,
        viewHeight: innerHeight,
        columns: document
          .querySelector('[data-columns]')
          .getAttribute('data-columns'),
      };
    });
    assert.equal(before.overflow, false);
    assert.ok(before.bodyHeight > before.viewHeight);
    assert.equal(before.scrollbar, 'none');
    assert.equal(before.galleryOverflow, 'visible');
    assert.equal(
      Number(before.columns),
      width >= 1200 ? 4 : width >= 768 ? 3 : 2,
    );
    if ((width === 1440 && height === 1080) || width === 390)
      await page.screenshot({ path: `${evidence}/${layout}-${width}.png` });
    await page.mouse.move(width / 2, height / 2);
    await page.mouse.wheel(0, 440);
    await page.waitForFunction(() => {
      const scroll = document.documentElement;
      const top = window.scrollY;
      if (scroll.dataset.lastTop !== String(top)) {
        scroll.dataset.lastTop = String(top);
        scroll.dataset.lastMotion = String(performance.now());
      }
      return (
        top > 0 && performance.now() - Number(scroll.dataset.lastMotion) > 200
      );
    });
    const scrolled = await page.evaluate(() => ({
      coverTop: document.querySelector('[data-cover]').getBoundingClientRect()
        .top,
      scrollTop: window.scrollY,
      chosen: [...document.querySelectorAll('[data-photo]')]
        .find((b) => {
          const r = b.getBoundingClientRect();
          const center = r.top + r.height / 2;
          return center >= 4 && center < innerHeight - 4;
        })
        ?.getAttribute('data-photo'),
    }));
    assert.equal(scrolled.coverTop, before.coverTop - scrolled.scrollTop);
    assert.ok(scrolled.chosen !== undefined);
    if (width === 1440 && height === 1080 && layout === 'masonry')
      await page.screenshot({ path: `${evidence}/masonry-scrolled.png` });
    await page.click(`loc=css:[data-photo="${scrolled.chosen}"]`);
    await page.waitForSelector('loc=css:.yarl__slide_current img');
    const openingScrollTop = await page.evaluate(() => window.scrollY);
    assert.equal(await image(), samples[Number(scrolled.chosen)].src);
    assert.deepEqual(
      await page.evaluate(() =>
        [...document.querySelectorAll('.yarl__button')].map(
          (b) => getComputedStyle(b).backgroundColor,
        ),
      ),
      ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'],
    );
    if (Number(scrolled.chosen) < 17) {
      await page.click('loc=css:button[aria-label="下一张"]');
      await page.waitForFunction(
        (expected) =>
          document
            .querySelector('.yarl__slide_current img')
            ?.getAttribute('src') === expected,
        samples[Number(scrolled.chosen) + 1].src,
      );
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(
        (expected) =>
          document
            .querySelector('.yarl__slide_current img')
            ?.getAttribute('src') === expected,
        samples[Number(scrolled.chosen)].src,
      );
    }
    if ((width === 1440 && height === 1080) || width === 390)
      await page.screenshot({
        path: `${evidence}/viewer-${layout}-${width}.png`,
      });
    await page.keyboard.press('Tab');
    console.log({ width, height, layout, openingScrollTop });
    assert.equal(
      await page.evaluate(
        () => !!document.activeElement?.closest('.yarl__root'),
      ),
      true,
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('loc=css:.yarl__root', { state: 'detached' });
    await page.waitForFunction(
      (expected) =>
        document.activeElement?.getAttribute('data-photo') === expected,
      scrolled.chosen,
    );
    assert.equal(await page.evaluate(() => window.scrollY), openingScrollTop);
    assert.equal(
      await page.evaluate(() =>
        document.activeElement?.getAttribute('data-photo'),
      ),
      scrolled.chosen,
    );
    results.push({
      width,
      height,
      layout,
      wholePageScroll: true,
      hiddenScrollbar: true,
      navigation: true,
      returnPosition: true,
    });
  }
}
await page.cdp('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1080,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.goto('http://127.0.0.1:61516/?layout=masonry');
await page.waitForSelector('loc=css:[data-photo="0"]');
await page.click('loc=css:[data-photo="0"]');
await page.waitForSelector('loc=css:.yarl__slide_current img');
assert.equal(
  await page.evaluate(
    () =>
      getComputedStyle(document.querySelector('button[aria-label="上一张"]'))
        .visibility,
  ),
  'hidden',
);
await page.keyboard.press('ArrowLeft');
assert.equal(await image(), samples[0].src);
await page.keyboard.press('Escape');
await page.waitForSelector('loc=css:.yarl__root', { state: 'detached' });
await page.click('loc=css:[data-photo="17"]');
await page.waitForSelector('loc=css:.yarl__slide_current img');
assert.equal(
  await page.evaluate(
    () =>
      getComputedStyle(document.querySelector('button[aria-label="下一张"]'))
        .visibility,
  ),
  'hidden',
);
await page.keyboard.press('ArrowRight');
assert.equal(await image(), samples[17].src);
await page.click('loc=css:button[aria-label="关闭图片"]');
await page.waitForSelector('loc=css:.yarl__root', { state: 'detached' });
await page.goto('http://127.0.0.1:61516/?layout=masonry');
await writeFile(
  `${evidence}/checks.json`,
  JSON.stringify({ results, finiteEnds: true, status: 'passed' }, null, 2),
);
console.log(
  JSON.stringify({ cases: results.length, finiteEnds: true, status: 'passed' }),
);
