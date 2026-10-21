import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DetailReplacementStatus } from '../../../src/components/library/detail-replacement';
import type { DetailReplacementController } from '../../../src/components/library/use-detail-replacement';

const idle = {
  setup: { unavailableReason: null, job: null },
  checking: false,
  uploading: false,
  transferComplete: false,
  progress: null,
  job: null,
  error: '',
  unknown: false,
  active: false,
};

function render(patch: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(DetailReplacementStatus, {
      state: { ...idle, ...patch } as unknown as DetailReplacementController,
    }),
  );
}

it('adds no replacement page, candidate, confirmation or normal-state notice to the original detail', () => {
  expect(render()).toBe('');
});

it('shows actual transfer progress in the detail without an extra submit action', () => {
  const html = render({ uploading: true, progress: 30 });
  expect(html).toContain('data-testid="detail-replacement-status"');
  expect(html).toContain('data-state="uploading"');
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-label="替换文件传输进度"');
  expect(html).toContain('aria-valuenow="30"');
  expect(html).not.toContain('replacement-submit');
  expect(html).not.toContain('待替换的新图片');
  expect(html).not.toContain('确认替换');
});

it.each(['queued', 'running'] as const)(
  'keeps an accepted %s task pending until publication succeeds',
  (status) => {
    const html = render({
      active: true,
      job: { id: 'replacement', status, step: 'watermark', error: null },
    });
    expect(html).toContain('data-state="processing"');
    expect(html).toContain('role="status"');
    expect(html).not.toMatch(/图片已替换|替换成功/);
    expect(html).not.toContain('返回图片详情');
  },
);

it('shows completion in place without a replacement footer or return step', () => {
  const html = render({
    job: {
      id: 'replacement',
      status: 'succeeded',
      step: 'complete',
      error: null,
    },
  });
  expect(html).toContain('data-state="succeeded"');
  expect(html).toMatch(/图片已替换|替换成功/);
  expect(html).not.toContain('detail-return');
  expect(html).not.toContain('replacement-submit');
});

it.each([
  { error: '替换图片格式无法识别' },
  {
    job: {
      id: 'replacement',
      status: 'failed',
      step: 'watermark',
      error: '真实水印写入失败',
    },
  },
])('retains the real replacement error in the detail: %j', (patch) => {
  const html = render(patch);
  expect(html).toContain('data-state="failed"');
  expect(html).toContain('role="alert"');
  expect(html).toContain(patch.error ?? patch.job!.error);
  expect(html).not.toContain('待替换的新图片');
  expect(html).not.toContain('确认替换');
});

it('keeps an uncertain upload visible without pretending its old image was replaced', () => {
  const html = render({
    unknown: true,
    error: '连接中断，替换请求结果待核对。',
  });
  expect(html).toContain('data-state="unknown"');
  expect(html).toContain('role="alert"');
  expect(html).toContain('连接中断，替换请求结果待核对。');
  expect(html).not.toMatch(/图片已替换|替换成功/);
});

it('shows a reopened cancelled task even when the server has no separate error text', () => {
  const html = render({
    job: {
      id: 'background-cancelled',
      status: 'cancelled',
      step: 'watermark',
      error: null,
    },
  });
  expect(html).toContain('data-state="failed"');
  expect(html).toContain('role="alert"');
  expect(html).toContain('替换任务已取消');
  expect(html).not.toMatch(/图片已替换|替换成功/);
});
