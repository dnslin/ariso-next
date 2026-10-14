import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResetPasswordResult } from '../../../src/components/identity/reset-password-result';

it('重置结果未知时明确提示待确认和重新申请，成功与无效状态保持原文案', () => {
  const unknown = renderToStaticMarkup(
    createElement(ResetPasswordResult, {
      state: 'unknown',
      detail: '连接中断',
    }),
  );
  expect(unknown).toContain('重置结果待确认');
  expect(unknown).toContain(
    '未收到明确结果，密码可能已更新。请重新申请链接，再设置一次密码。',
  );
  expect(unknown).toContain('连接中断');
  expect(unknown).toContain('href="/forgot-password"');
  expect(unknown).toContain('href="/login"');
  expect(unknown).not.toContain('重置未完成');

  expect(
    renderToStaticMarkup(
      createElement(ResetPasswordResult, { state: 'success', detail: '' }),
    ),
  ).toContain('密码已更新');
  expect(
    renderToStaticMarkup(
      createElement(ResetPasswordResult, { state: 'invalid', detail: '' }),
    ),
  ).toContain('链接无法使用');
});
