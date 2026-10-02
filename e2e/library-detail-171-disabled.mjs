import assert from 'node:assert/strict';
import {
  button,
  openDetail171,
  readProcessingSettings,
  restoreProcessingSettings,
  prepareDetail171Versions,
} from './library-detail-171-helpers.mjs';
import { verifyReprocessLayout } from './library-detail-171-layouts.mjs';

export async function verifyDetail171Disabled({ page, config, sql, report }) {
  await prepareDetail171Versions({ page, sql });
  const settings = await readProcessingSettings(sql);
  try {
    await sql(
      "UPDATE media_settings SET compression_enabled=0,watermark_mode='off' WHERE id=1",
    );
    await openDetail171(page, config);
    const disabled = await page.evaluate(() =>
      ['compressed', 'watermark'].map(
        (kind) =>
          document.querySelector(
            `[data-testid="reprocess-scope-${kind}"] input`,
          ).disabled,
      ),
    );
    assert.deepEqual(disabled, [true, true]);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="reprocess-submit"]').disabled,
      ),
      false,
    );
    const assertDisabledReasons = async () => {
      const result = await page.evaluate(() => {
        const contents = [
          ...document.querySelectorAll(
            '[data-slot="radio-content"][data-testid^="reprocess-scope-"]',
          ),
        ];
        const common = document.querySelector(
          '[data-testid="reprocess-scope-unavailable"]',
        );
        const disabled = contents.filter(
          (content) => content.querySelector('input').disabled,
        );
        return {
          total: contents.length,
          disabled: disabled.length,
          commonCount: document.querySelectorAll(
            '[data-testid="reprocess-scope-unavailable"]',
          ).length,
          styles: disabled.map((content) => {
            const local = content
              .closest('[data-slot="radio"]')
              .querySelector('[data-slot="description"]');
            const description = local ?? common;
            let opacity = 1;
            let visible = !!description?.getClientRects().length;
            for (
              let node = description;
              node && node.closest('[data-testid="detail-reprocess"]');
              node = node.parentElement
            ) {
              const style = getComputedStyle(node);
              opacity *= Number(style.opacity);
              visible &&=
                style.display !== 'none' && style.visibility === 'visible';
            }
            return {
              content: Number(getComputedStyle(content).opacity),
              reason: description?.textContent.trim(),
              local: !!local,
              visible,
              opacity,
            };
          }),
        };
      });
      assert.equal(result.total, 4);
      assert.ok(result.styles.length > 0);
      if (result.commonCount) {
        assert.equal(
          result.commonCount,
          1,
          'Shared unavailability reason appears once',
        );
        assert.equal(
          result.disabled,
          4,
          'Shared reason applies only when all choices are disabled',
        );
        assert.ok(result.styles.every((style) => !style.local));
      }
      for (const style of result.styles) {
        assert.equal(style.content, 0.42, 'Only disabled choice is faded');
        assert.ok(style.reason, 'Disabled choice explains why');
        assert.equal(style.visible, true, 'Disabled reason is visible');
        assert.equal(
          style.opacity,
          1,
          'Reason retains full muted-text opacity',
        );
      }
    };
    await assertDisabledReasons();
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll('button')].some((node) =>
          node.textContent.includes('去设置开启压缩'),
        ),
      ),
      false,
    );
    await verifyReprocessLayout(
      { page, config, report },
      'reprocess-disabled-settings',
    );
    await sql("UPDATE media_settings SET watermark_mode='text' WHERE id=1");
    await openDetail171(page, config);
    await page.waitForSelector(button('去设置开启压缩'));
    assert.equal(
      await page.evaluate(
        () =>
          [...document.querySelectorAll('button')].find((node) =>
            node.textContent.includes('去设置开启压缩'),
          ).disabled,
      ),
      true,
    );
    await assertDisabledReasons();
    await verifyReprocessLayout(
      { page, config, report },
      'reprocess-disabled-compression',
    );
    await sql("UPDATE media_settings SET watermark_mode='off' WHERE id=1");
    await openDetail171(page, config);
    await page.click(button('返回详情'));
    await page.waitForSelector('[data-testid="detail-body"]');
    for (const name of ['压缩图', '水印图']) {
      await page.click(`loc=role:tab[name="${name}"]`);
      assert.equal(
        await page.evaluate(
          (label) =>
            [
              ...document.querySelectorAll(
                '[data-testid="detail-actions"] button',
              ),
            ].find((node) => node.textContent === `下载${label}`).disabled,
          name,
        ),
        false,
      );
    }
    await openDetail171(page, config, 'library-006');
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="reprocess-submit"]').disabled,
      ),
      true,
    );
    assert.ok(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="detail-reprocess"]')
          .textContent.includes('存储已停用 · 内容不可读'),
      ),
    );
    await assertDisabledReasons();
    await verifyReprocessLayout(
      { page, config, report },
      'reprocess-disabled-storage',
    );
    await openDetail171(page, config, 'library-003');
    for (const scope of ['compressed', 'thumbnail', 'watermark'])
      assert.equal(
        await page.evaluate(
          (scope) =>
            document.querySelector(
              `[data-testid="reprocess-scope-${scope}"] input`,
            ).disabled,
          scope,
        ),
        true,
      );
    await assertDisabledReasons();
    assert.equal(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="detail-reprocess"]')
          .innerText.includes('关闭处理开关不会删除或隐藏已有压缩图、水印图。'),
      ),
      false,
    );
    await verifyReprocessLayout(
      { page, config, report },
      'reprocess-first-failure',
    );
    report.checks.push(
      'Saved compression/watermark remain downloadable after settings turn off; disabled scope reasons render, stopped storage forbids submit, and a persisted first-processing failure offers only all-scope retry.',
    );
  } finally {
    await restoreProcessingSettings(sql, settings);
  }
}
