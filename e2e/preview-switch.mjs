import assert from 'node:assert/strict';

// Read-only: use the open detail dialog and its saved versions.
export async function verifyPreviewSwitch(page) {
  const initialLabel = await page.evaluate(() =>
    document
      .querySelector('[role="tab"][aria-selected="true"]')
      .textContent.trim(),
  );
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('[role="tab"]')]
      .filter(
        (tab) => tab.getAttribute('aria-disabled') !== 'true' && !tab.disabled,
      )
      .map((tab) => tab.textContent.trim()),
  );
  assert.ok(labels.length >= 2, 'Need at least two saved preview versions');
  for (const label of labels) {
    await page.click(`loc=role:tab[name="${label}"]`);
    await page.waitForFunction(() => {
      const img = document.querySelector(
        '[data-testid="detail-preview"]:not([data-inert] *)',
      );
      return (
        img?.complete &&
        img.naturalWidth > 0 &&
        getComputedStyle(img).opacity === '1'
      );
    });
  }
  await page.evaluate(() => {
    window.previewSwitchEvidence = [];
    window.previewSwitchObserver = new MutationObserver(() => {
      const stage = document.querySelector(
        '[data-testid="preview-stage"]:not([data-inert] *)',
      );
      const img = stage?.querySelector('img');
      const box = stage?.getBoundingClientRect();
      window.previewSwitchEvidence.push({
        tab: document.querySelector('[role="tab"][aria-selected="true"]')
          ?.textContent,
        ready:
          !!img?.complete &&
          img.naturalWidth > 0 &&
          getComputedStyle(img).opacity === '1',
        skeleton: !!stage?.querySelector('[data-testid="preview-skeleton"]'),
        width: box?.width,
        height: box?.height,
        visibleStages: [
          ...document.querySelectorAll('[data-testid="preview-stage"]'),
        ].filter((el) => el.getClientRects().length).length,
      });
    });
    window.previewSwitchObserver.observe(
      document.querySelector('[data-testid="detail-body"]'),
      { childList: true, subtree: true, attributes: true },
    );
  });
  let evidence;
  try {
    for (let round = 0; round < 2; round++) {
      for (const label of labels)
        await page.click(`loc=role:tab[name="${label}"]`);
    }
    evidence = await page.evaluate(() => window.previewSwitchEvidence);
  } finally {
    await page.evaluate(() => window.previewSwitchObserver.disconnect());
    await page.click(`loc=role:tab[name="${initialLabel}"]`);
  }
  assert.ok(evidence.length > 0);
  assert.ok(
    evidence.every((frame) => frame.ready && !frame.skeleton),
    'Loaded versions must never return to a blank/loading state',
  );
  assert.ok(
    evidence.every((frame) => frame.visibleStages === 1),
    'Only selected preview is visible',
  );
  assert.ok(
    evidence.every(
      (frame) =>
        Math.abs(frame.width - evidence[0].width) < 1 &&
        Math.abs(frame.height - evidence[0].height) < 1,
    ),
    'Preview geometry stays stable',
  );
  return { labels, observations: evidence.length, passed: true };
}
