import assert from 'node:assert/strict';

/** Check server-rendered and asynchronously read content on a real hard load. */
export async function verifyReducedMotionReload(page, origin, report) {
  const width = await page.evaluate(() => innerWidth);
  const wasReduced = await page.evaluate(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const script = await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `(${function () {
      const samples = [];
      const ids = new WeakMap();
      let nextId = 0;
      let frame;
      const tick = () => {
        for (const element of document.querySelectorAll(
          'main [data-component-entry]',
        )) {
          if (!ids.has(element)) ids.set(element, ++nextId);
          const style = getComputedStyle(element);
          samples.push({
            id: ids.get(element),
            label: element.textContent.slice(0, 35),
            y: new DOMMatrix(style.transform).m42,
            timings: element
              .getAnimations()
              .filter((animation) =>
                animation.effect
                  .getKeyframes()
                  .some((keyframe) => 'opacity' in keyframe),
              )
              .map((animation) => {
                const { duration, delay } = animation.effect.getTiming();
                return { duration, delay };
              }),
          });
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      window.__reducedEntryProbe = {
        stop() {
          cancelAnimationFrame(frame);
          return samples;
        },
      };
    }.toString()})();`,
  });
  try {
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await page.goto(`${origin}/settings/general`);
    await page.waitForFunction(() => {
      const entries = [
        ...document.querySelectorAll('main [data-component-entry]'),
      ];
      return (
        entries.length === 4 &&
        entries.every(
          (element) => Number(getComputedStyle(element).opacity) > 0.999,
        )
      );
    });
    const samples = await page.evaluate(() =>
      window.__reducedEntryProbe.stop(),
    );
    const entries = [...new Set(samples.map((sample) => sample.id))].map(
      (id) => {
        const frames = samples.filter((sample) => sample.id === id);
        return {
          label: frames[0].label,
          maximumTravelPx: Math.max(
            ...frames.map((frame) => Math.abs(frame.y)),
          ),
          timings: frames.flatMap((frame) => frame.timings),
        };
      },
    );
    report.reducedReloadEntries ??= [];
    report.reducedReloadEntries.push({
      route: '/settings/general',
      width,
      entries,
    });
    assert.equal(
      entries.length,
      4,
      'Sample the SSR heading, related settings and both async forms',
    );
    for (const entry of entries) {
      assert.ok(
        entry.maximumTravelPx < 0.1,
        `${entry.label} has no reduced-motion travel`,
      );
      assert.ok(
        entry.timings.length,
        `${entry.label} has a visible opacity animation`,
      );
      assert.ok(
        entry.timings.every(
          ({ duration, delay }) => duration === 200 && delay === 0,
        ),
        `${entry.label} uses 200ms opacity and no stagger on a reduced-motion hard load`,
      );
    }
    report.checks.push(
      `Reduced-motion hard load applies 200ms opacity and no stagger to SSR and async components at ${width}px`,
    );
  } finally {
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: script.identifier,
    });
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        {
          name: 'prefers-reduced-motion',
          value: wasReduced ? 'reduce' : 'no-preference',
        },
      ],
    });
  }
}
