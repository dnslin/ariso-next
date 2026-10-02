import assert from 'node:assert/strict';

/** Measure rendered text fragments, so wrapping and close-button overlap are tested directly. */
export async function verifyToastTextLayout(page) {
  const actual = await page.evaluate(() => {
    const toast = document.querySelector(
      '[data-slot="toast"][data-frontmost="true"]',
    );
    if (!toast) return null;
    const title = toast.querySelector('[data-slot="toast-title"]');
    const close = toast.querySelector('[data-slot="toast-close"]');
    const textRects = [];
    const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects())
        if (rect.width > 0 && rect.height > 0) textRects.push(rect.toJSON());
    }
    return {
      title: title.textContent,
      toast: toast.getBoundingClientRect().toJSON(),
      close: close.getBoundingClientRect().toJSON(),
      textRects,
      closeOpacity: getComputedStyle(close).opacity,
      closePointer: getComputedStyle(close).pointerEvents,
      closeFocused:
        document.activeElement === close &&
        close.matches(':focus-visible,[data-focus-visible="true"]'),
    };
  });
  if (!actual) return null; // Transient notifications can expire between layout states.
  assert.ok(actual.title.trim().length > 0);
  assert.ok(
    actual.textRects.length > 0,
    'Toast title has rendered text fragments',
  );
  for (const rect of actual.textRects) {
    assert.ok(
      rect.left >= actual.toast.left - 1 &&
        rect.right <= actual.toast.right + 1,
      'Every toast text line fits its surface',
    );
    assert.ok(
      rect.top >= actual.toast.top - 1 &&
        rect.bottom <= actual.toast.bottom + 1,
      'Every toast text line fits its surface height',
    );
    const overlaps =
      rect.left < actual.close.right &&
      rect.right > actual.close.left &&
      rect.top < actual.close.bottom &&
      rect.bottom > actual.close.top;
    assert.equal(
      overlaps,
      false,
      'The close target never covers a rendered toast text fragment',
    );
  }
  return actual;
}
