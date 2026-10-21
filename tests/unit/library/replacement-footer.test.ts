import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DOMParser } from '@xmldom/xmldom';
import { expect, it, vi } from 'vitest';
import { DetailReplacementFooter } from '../../../src/components/library/detail-replacement';
import type { DetailReplacementController } from '../../../src/components/library/use-detail-replacement';

it('offers one enabled primary return action after replacement succeeds', () => {
  const state = {
    detail: { id: 'image' },
    job: { id: 'replacement', status: 'succeeded' },
    active: false,
    uploading: false,
    onReturn: vi.fn(),
  } as unknown as DetailReplacementController;
  const html = renderToStaticMarkup(
    createElement(DetailReplacementFooter, { state }),
  );
  const buttons = new DOMParser()
    .parseFromString(html, 'text/html')
    .getElementsByTagName('button');
  expect(buttons.length).toBe(1);
  expect(buttons[0].textContent).toBe('返回图片详情');
  expect(buttons[0].hasAttribute('disabled')).toBe(false);
  expect(buttons[0].getAttribute('class')).toContain('button--primary');
});
