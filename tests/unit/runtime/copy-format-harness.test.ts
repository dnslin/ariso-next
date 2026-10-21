import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToggleButton } from '@heroui/react/toggle-button';
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group';
import { DOMParser } from '@xmldom/xmldom';
import { afterEach, expect, it, vi } from 'vitest';
import { selectCopyFormat } from '../../../e2e/library-detail.mjs';

afterEach(() => vi.unstubAllGlobals());
it.each([
  ['URL', 'url'],
  ['Markdown', 'markdown'],
  ['HTML', 'html'],
])(
  'recognizes HeroUI single-choice %s before activating the one copy action',
  async (label, format) => {
    const properties = { id: format, 'data-copy-format': format };
    const html = renderToStaticMarkup(
      createElement(
        ToggleButtonGroup,
        {
          selectionMode: 'single',
          disallowEmptySelection: true,
          selectedKeys: [format],
          'aria-label': '复制格式',
        },
        createElement(ToggleButton, properties, label),
      ),
    );
    const button = new DOMParser()
      .parseFromString(html, 'text/html')
      .getElementsByTagName('button')[0];
    expect(button.getAttribute('role')).toBe('radio');
    expect(button.getAttribute('aria-checked')).toBe('true');
    vi.stubGlobal('document', { querySelector: () => button });
    const click = vi.fn();
    const page = {
      click,
      waitForFunction: async (
        predicate: (value: string) => boolean,
        value: string,
      ) => {
        expect(predicate(value)).toBe(true);
      },
    };
    await selectCopyFormat(page, `复制 ${label}`);
    expect(click.mock.calls.map(([selector]) => selector)).toEqual([
      `[data-testid="detail-copy-format"] [data-copy-format="${format}"]`,
      '[data-testid="detail-copy-submit"]',
    ]);
  },
);
