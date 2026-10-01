import assert from 'node:assert/strict';

export async function resizeViewport(
  page,
  width,
  height = width >= 1200 ? 1080 : 844,
) {
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await page.waitForFunction(
    ({ width, height }) => innerWidth === width && innerHeight === height,
    { width, height },
  );
}

export async function setTheme(page, theme) {
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: theme },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  });
  await page.waitForFunction(
    (theme) => document.documentElement.classList.contains(theme),
    theme,
  );
}

export async function readGeometry(page) {
  return page.evaluate(() => {
    function visible(node) {
      if (
        !node.getClientRects().length ||
        node.closest('[inert],[aria-hidden="true"]')
      )
        return false;
      // React Aria's assistive dismiss controls are intentionally clipped.
      // Exclude visual hiding, never a small measured click target.
      for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (
          style.visibility === 'hidden' ||
          style.clip === 'rect(0px, 0px, 0px, 0px)' ||
          style.clipPath === 'inset(50%)'
        )
          return false;
      }
      return true;
    }
    return {
      width: innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth,
      mainOverflow: [...document.querySelectorAll('main')]
        .filter(visible)
        .some((node) => node.scrollWidth > node.clientWidth),
      targets: [...document.querySelectorAll('button,a,input,textarea')]
        .filter(visible)
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            name:
              node.getAttribute('aria-label') || node.textContent || node.name,
            width: rect.width,
            height: rect.height,
            navigation: node.classList.contains('shell-nav-link'),
          };
        }),
    };
  });
}

export function assertGeometry(geometry, label) {
  assert.equal(geometry.overflow, false, `${label} document overflow`);
  assert.equal(geometry.mainOverflow, false, `${label} main overflow`);
  for (const target of geometry.targets)
    assert.ok(
      target.width >= (geometry.width < 1200 ? 44 : 24) &&
        target.height >= (geometry.width < 1200 ? 44 : 24),
      `${label}: ${target.name} has a usable target (${target.width}×${target.height})`,
    );
}
