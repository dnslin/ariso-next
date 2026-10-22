import assert from 'node:assert/strict';
import { waitForImageWorkflow } from './image-workflows-fixture.mjs';
import { workflowButton } from './image-workflows-page.mjs';

const dialog = '[data-testid="detail-copy-dialog"]';
export async function verifyImageWorkflowSizes({ page, report, fixture, ui }) {
  await ui.visit();
  await ui.openDetail(fixture.privateImage);
  await page.click(workflowButton('复制链接'));
  await page.waitForSelector(dialog);
  await page.click('[data-testid="detail-copy-version"]');
  await page.waitForSelector('loc=role:option[name="水印图"]');
  await page.click('loc=role:option[name="水印图"]');
  await ui.sourcePreview(
    fixture.privateImage,
    'watermark',
    '[data-testid="detail-copy-source-preview"]',
  );
  await page.click('[data-testid="detail-copy-version"]');
  await page.waitForSelector('loc=role:option[name="压缩图"]');
  await page.click('loc=role:option[name="压缩图"]');
  await ui.sourcePreview(
    fixture.privateImage,
    'compressed',
    '[data-testid="detail-copy-source-preview"]',
  );
  const sizes = {};
  for (const [preset, edge] of [
    ['small', 640],
    ['medium', 1280],
    ['large', 1920],
  ]) {
    await page.click('[data-testid="detail-copy-size"]');
    await page.waitForSelector(`loc=role:option[name="最长边 ${edge} px"]`);
    await page.click(`loc=role:option[name="最长边 ${edge} px"]`);
    await page.waitForFunction(() => {
      const button = document.querySelector(
        '[data-testid="detail-copy-submit"]',
      );
      return (
        button &&
        !button.disabled &&
        button.textContent.includes('生成尺寸图片')
      );
    });
    await page.click('[data-testid="detail-copy-submit"]');
    const ready = await waitForImageWorkflow(
      () =>
        fixture.json(
          `/api/images/${fixture.privateImage.id}/sizes?version=compressed&preset=${preset}`,
        ),
      (state) => {
        assert.ok(
          !['failed', 'cancelled'].includes(state.status),
          JSON.stringify(state),
        );
        return state.status === 'ready';
      },
      `Generated ${edge}px preset`,
    );
    await page.waitForFunction(
      (url) =>
        document.querySelector('[data-testid="detail-copy-preview"]')?.value ===
        url,
      ready.links.url,
    );
    for (const [format, label] of [
      ['url', 'URL'],
      ['markdown', 'Markdown'],
      ['html', 'HTML'],
    ]) {
      await page.waitForSelector(
        `[data-testid="detail-copy-format"] button:text-is("${label}")`,
      );
      await page.click(
        `[data-testid="detail-copy-format"] button:text-is("${label}")`,
      );
      await page.waitForFunction(
        (value) =>
          document.querySelector('[data-testid="detail-copy-preview"]')
            ?.value === value,
        ready.links[format],
      );
    }
    await page.click(
      '[data-testid="detail-copy-format"] button:text-is("URL")',
    );
    const actual = await fixture.dimensions(
      ready.links.url,
      `private-${preset}-before`,
    );
    assert.equal(Math.max(actual.width, actual.height), Math.min(edge, 1600));
    assert.equal(actual.width / actual.height, 1000 / 1600);
    sizes[preset] = { ...actual, links: ready.links };
    report.checks.push({
      scenario: 'preset-real-dimensions-and-visible-formats',
      preset,
      edge,
      ...actual,
    });
    if (preset === 'medium') {
      await ui.capture(
        'size-link-formats',
        dialog,
        '[data-testid="detail-copy-submit"]',
      );
      await ui.captureMobileForm('size-link', [
        ['version-size', '[data-testid="detail-copy-version"]'],
        [
          'options-formats',
          '[data-testid="detail-copy-format"] [data-copy-format="url"]',
        ],
        [
          'complete-link',
          '[data-testid="detail-copy-preview"]',
          ready.links.url,
        ],
      ]);
      await ui.modalKeyboard(dialog, '[data-testid="detail-copy-version"]');
    }
  }
  await page.click(workflowButton('关闭复制链接'));
  await page.waitForSelector(dialog, { state: 'hidden' });
  const queued = await fixture.response(
    `/api/images/${fixture.smallImage.id}/sizes`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 'compressed', preset: 'large' }),
    },
  );
  assert.ok([200, 202].includes(queued.status), await queued.text());
  const small = await waitForImageWorkflow(
    () =>
      fixture.json(
        `/api/images/${fixture.smallImage.id}/sizes?version=compressed&preset=large`,
      ),
    (state) => state.status === 'ready',
    'Small original keeps its natural size',
  );
  const actual = await fixture.dimensions(
    small.links.url,
    'small-no-enlargement',
  );
  assert.deepEqual([actual.width, actual.height], [300, 200]);
  report.checks.push({ scenario: 'small-image-is-never-enlarged', ...actual });
  return sizes;
}
