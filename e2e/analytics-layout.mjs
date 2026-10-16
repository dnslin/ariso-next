import assert from 'node:assert/strict';

export async function assertVersionsAndPopularLayout(
  page,
  width,
  report,
  expectedPopularRows = 10,
) {
  const layout = await page.evaluate(() => {
    const versions = document.querySelector(
      '[data-testid="analytics-versions"]',
    );
    const popular = document.querySelector('[data-testid="analytics-popular"]');
    const rect = (node) => {
      const { left, top, bottom, width, height } = node.getBoundingClientRect();
      return { left, top, bottom, width, height };
    };
    return {
      versions: rect(versions),
      popular: rect(popular),
      rows: [...versions.querySelectorAll('dl > div')].map(rect),
      popularRows: popular.querySelectorAll('li[data-image-id]').length,
    };
  });
  assert.equal(layout.rows.length, 3);
  assert.ok(
    Math.abs(layout.versions.left - layout.popular.left) <= 1 &&
      Math.abs(layout.versions.width - layout.popular.width) <= 1,
    'Versions and popular images each occupy the full content width',
  );
  assert.ok(
    layout.popular.top >= layout.versions.bottom &&
      layout.popular.top - layout.versions.bottom <= 40,
    'The popular list follows the compact version section without a blank column',
  );
  assert.ok(layout.versions.height < 240, 'Three version values stay compact');
  for (const [index, row] of layout.rows.entries()) {
    if (!index) continue;
    if (width >= 768) {
      assert.ok(
        Math.abs(row.top - layout.rows[0].top) <= 1 &&
          row.left >=
            layout.rows[index - 1].left + layout.rows[index - 1].width,
        'Desktop and tablet versions form one horizontal row',
      );
    } else {
      assert.ok(
        row.top >= layout.rows[index - 1].bottom &&
          Math.abs(row.width - layout.rows[0].width) <= 1,
        'Phone versions form three compact full-width rows',
      );
    }
  }
  assert.equal(
    layout.popularRows,
    expectedPopularRows,
    'The full Top 10 or the genuine empty state remains visible',
  );
  report.versionPopularLayouts ??= [];
  report.versionPopularLayouts.push({ viewportWidth: width, ...layout });
}
