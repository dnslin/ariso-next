import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { ShareCreateForm } from '../../../src/app/shares/create-form';
import type { useSettings } from '../../../src/app/shares/use-settings';
import { expiryDraft } from '../../../src/app/shares/model';

it('directly renders an editable creation form, not an intermediate empty-state button or creation dialog', () => {
  const create = vi.fn();
  const settings = {
    password: '保留密码',
    setPassword: vi.fn(),
    showName: false,
    setShowName: vi.fn(),
    expiry: expiryDraft(null, 'UTC'),
    setExpiry: vi.fn(),
    busy: false,
    blocked: false,
    errors: { create: '创建错误仍然可见' },
    create,
  } as unknown as ReturnType<typeof useSettings>;
  const html = renderToStaticMarkup(
    createElement(ShareCreateForm, { settings, timeZone: 'UTC' }),
  );
  expect(html).toContain('data-testid="share-create"');
  expect(html).toContain('访问密码');
  expect(html).toContain('显示图片名称');
  const nameSwitch = html.match(/<input[^>]*role="switch"[^>]*>/)?.[0];
  expect(nameSwitch).toBeDefined();
  expect(nameSwitch).not.toContain('checked=');
  expect(html).toContain('截止方式');
  expect(html).toContain('保留密码');
  expect(html).toContain('id="share-create-form"');
  expect(html).not.toContain('type="submit"');
  expect(html).toContain('创建错误仍然可见');
  expect(html).not.toContain('尚未创建分享');
  expect(html).not.toContain('role="dialog"');
  expect(create).not.toHaveBeenCalled();
});
