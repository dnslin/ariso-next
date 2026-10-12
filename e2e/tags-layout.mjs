import assert from 'node:assert/strict';
import { tagDialogSelector } from './tags-dialog.mjs';

export async function tagStyles(page, theme, width) {
  const styles = await page.evaluate((dialogSelector) => {
    if (location.pathname !== '/tags') return null;
    const visible = (node) => node?.getClientRects().length > 0;
    const font = (node) => {
      if (!visible(node)) return null;
      const css = getComputedStyle(node);
      return { size: css.fontSize, weight: css.fontWeight };
    };
    const icon = (input, className) => {
      if (!visible(input)) return null;
      const svg = input.closest('.input-group')?.querySelector(className);
      if (!visible(svg)) return { visible: false };
      const bounds = svg.getBoundingClientRect();
      return { visible: true, width: bounds.width, height: bounds.height };
    };
    const header = document.querySelector('[data-testid="tags-list"] thead');
    const hint = document.querySelector(`${dialogSelector} .bg-default`);
    const resultLink = document.querySelector(
      `${dialogSelector} a[href^="/library?tagId="]`,
    );
    const notice = document.querySelector('[data-testid="tags-notice"]');
    const listError = document.querySelector('[data-testid="tags-error"]');
    const dialog = document.querySelector(dialogSelector);
    return {
      search: font(document.querySelector('input[aria-label="搜索标签名称"]')),
      nameInput: font(document.querySelector('#tag-name')),
      mobileName: font(
        document.querySelector(
          '[data-testid="tags-list"] li a > span:first-child',
        ),
      ),
      searchIcon: icon(
        document.querySelector('input[aria-label="搜索标签名称"]'),
        '.lucide-search',
      ),
      nameIcon: icon(document.querySelector('#tag-name'), '.lucide-tag'),
      mobileMetadata: [
        ...document.querySelectorAll(
          '[data-testid="tags-list"] li a > span:nth-child(2)',
        ),
      ]
        .filter(visible)
        .map((metadata) =>
          [...metadata.children].map((part) => ({
            text: part.textContent,
            top: part.getBoundingClientRect().top,
          })),
        ),
      actionGroups: [
        ...document.querySelectorAll(
          '[data-testid="tags-list"] [data-slot="button-group"]',
        ),
      ]
        .filter(visible)
        .map((group) =>
          [...group.querySelectorAll('button')].map((button) => {
            const rect = button.getBoundingClientRect();
            return {
              name: button.getAttribute('aria-label'),
              width: rect.width,
              height: rect.height,
            };
          }),
        ),
      hint: visible(hint) ? getComputedStyle(hint).backgroundColor : null,
      notice: visible(notice) ? getComputedStyle(notice).backgroundColor : null,
      listError: visible(listError)
        ? getComputedStyle(listError).backgroundColor
        : null,
      dialogMessages: visible(dialog)
        ? [...dialog.querySelectorAll('.bg-default')].filter(visible).length
        : null,
      dialogHasFeedback: dialog?.dataset.hasFeedback === 'true',
      nameHelp: visible(
        dialog?.querySelector('button[aria-label="标签名称说明"]'),
      ),
      resultLink: visible(resultLink)
        ? getComputedStyle(resultLink).backgroundColor
        : null,
      header: visible(header)
        ? {
            background: getComputedStyle(header).backgroundColor,
            bottomBorder: getComputedStyle(header).borderBottomWidth,
            columns: [...header.querySelectorAll('th')].map((column) => ({
              background: getComputedStyle(column).backgroundColor,
              rightBorder: getComputedStyle(column).borderRightWidth,
              dividerDisplay: getComputedStyle(column, '::after').display,
            })),
          }
        : null,
    };
  }, tagDialogSelector);
  if (!styles) return null;
  for (const group of styles.actionGroups) {
    assert.equal(group.length, 2, 'Tag row has only its two existing actions');
    assert.match(group[0].name, /^重命名标签 /);
    assert.match(group[1].name, /^删除标签 /);
    for (const action of group)
      assert.ok(
        action.width >= 44 && action.height >= 44,
        `${action.name}: icon action preserves its 44px target`,
      );
  }
  for (const [name, actual] of Object.entries({
    search: styles.searchIcon,
    name: styles.nameIcon,
  }))
    if (actual)
      assert.deepEqual(
        actual,
        { visible: true, width: 16, height: 16 },
        `${name} input exposes its 16px prefix icon`,
      );
  if (width < 768)
    for (const metadata of styles.mobileMetadata) {
      assert.equal(
        metadata.length,
        2,
        'Mobile metadata separates image count and creation date',
      );
      assert.ok(
        Math.abs(metadata[0].top - metadata[1].top) <= 1,
        'Image count and creation date share one line at ordinary mobile widths',
      );
    }
  if (styles.dialogMessages !== null)
    assert.equal(
      styles.dialogMessages,
      styles.dialogHasFeedback ? 1 : 0,
      'Normal rules use Tips; validation, actual outcomes and deletion retain one visible explanation',
    );
  if (styles.dialogMessages === 0)
    assert.equal(styles.nameHelp, true, 'Normal tag form exposes name Tips');
  for (const [name, actual] of Object.entries({
    search: styles.search,
    nameInput: styles.nameInput,
    mobileName: styles.mobileName,
  }))
    if (actual)
      assert.deepEqual(
        actual,
        { size: '14px', weight: '400' },
        `${theme}/${width}: ${name} renders at 14px Regular`,
      );
  const hintColor =
    theme === 'light' ? 'rgb(227, 246, 245)' : 'rgb(37, 61, 64)';
  for (const name of ['hint', 'notice', 'listError'])
    if (styles[name])
      assert.equal(
        styles[name],
        hintColor,
        `${theme}/${width}: ${name} uses the shared water-green surface`,
      );
  if (styles.resultLink)
    assert.equal(
      styles.resultLink,
      'rgb(255, 216, 7)',
      `${theme}/${width}: reused-tag library action uses brand yellow`,
    );
  if (styles.header) {
    assert.equal(
      styles.header.background,
      'rgba(0, 0, 0, 0)',
      'Tag table header has no gray background',
    );
    assert.equal(
      styles.header.bottomBorder,
      '0px',
      'Tag header has no extra horizontal divider',
    );
    for (const column of styles.header.columns) {
      assert.equal(column.background, 'rgba(0, 0, 0, 0)');
      assert.equal(
        column.rightBorder,
        '0px',
        'Tag columns have no vertical borders',
      );
      assert.equal(
        column.dividerDisplay,
        'none',
        'Tag columns have no pseudo-element dividers',
      );
    }
  }
  return styles;
}
