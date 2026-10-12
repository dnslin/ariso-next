import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { BrandingRow } from '../../../src/components/site/branding-row';

it.each(['logo', 'favicon'] as const)(
  'configured %s has one named replacement/removal icon group',
  (kind) => {
    const label = kind === 'logo' ? 'Logo' : 'Favicon';
    const html = renderToStaticMarkup(
      createElement(BrandingRow, {
        kind,
        url: '/branding/current.png',
        disabled: false,
        onSelect: vi.fn(),
        onRemove: vi.fn(),
      }),
    );
    expect(html).toContain(`aria-label="${label} 操作"`);
    for (const [action, testId] of [
      ['替换', 'choose'],
      ['移除', 'delete'],
    ]) {
      const button = html.match(
        new RegExp(
          `<button\\b(?=[^>]*aria-label="${action} ${label}")(?=[^>]*data-testid="branding-${kind}-${testId}")[^>]*>`,
        ),
      )?.[0];
      expect(button).toBeDefined();
      expect(button).toContain('min-h-11');
      expect(button).toContain('min-w-11');
    }
    expect(html).toContain('lucide-upload');
    expect(html).toContain('lucide-trash-2');
    expect(html).not.toContain('替换文件');
    expect(html).toContain('最大 5 MiB');
  },
);

it.each([false, true])(
  'unconfigured branding retains its clear file choice and disabled=%s',
  (disabled) => {
    const html = renderToStaticMarkup(
      createElement(BrandingRow, {
        kind: 'logo',
        url: null,
        disabled,
        onSelect: vi.fn(),
        onRemove: vi.fn(),
      }),
    );
    expect(html).toContain('选择文件');
    expect(html).toContain('aria-label="选择 Logo 文件"');
    expect(html).not.toContain('aria-label="移除 Logo"');
    expect(html).not.toContain('aria-label="Logo 操作"');
    const button = html.match(
      /<button\b(?=[^>]*data-testid="branding-logo-choose")[^>]*>/,
    )![0];
    expect(button.includes('disabled=')).toBe(disabled);
  },
);
