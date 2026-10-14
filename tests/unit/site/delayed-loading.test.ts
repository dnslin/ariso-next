import { createElement, type EffectCallback } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DelayedLoading } from '../../../src/components/delayed-loading';

const runtime = vi.hoisted(() => ({
  visible: false,
  effect: null as EffectCallback | null,
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: () => [
    runtime.visible,
    (value: boolean) => (runtime.visible = value),
  ],
  useEffect: (effect: EffectCallback) => {
    runtime.effect = effect;
  },
}));

const render = (pending = true) =>
  renderToStaticMarkup(
    createElement(
      DelayedLoading,
      { pending },
      createElement(
        'p',
        { role: pending ? 'status' : 'alert' },
        pending ? '正在读取设置' : '读取失败，请重试',
      ),
    ),
  );

beforeEach(() => {
  vi.useFakeTimers();
  runtime.visible = false;
  runtime.effect = null;
});
afterEach(() => vi.useRealTimers());

it('300ms 前隐藏提示但保留布局，达到阈值后显示并恢复辅助阅读', () => {
  expect(render()).toContain('class="contents invisible" aria-hidden="true"');
  const cleanup = runtime.effect!();
  vi.advanceTimersByTime(299);
  expect(render()).toContain('aria-hidden="true"');
  vi.advanceTimersByTime(1);
  expect(render()).toContain('class="contents" aria-hidden="false"');
  if (typeof cleanup === 'function') cleanup();
});

it('快速加载结束或离开页面会取消计时，不会迟到显示提示', () => {
  render();
  const cleanup = runtime.effect!();
  vi.advanceTimersByTime(100);
  if (typeof cleanup === 'function') cleanup();
  vi.advanceTimersByTime(300);
  expect(runtime.visible).toBe(false);
});

it('错误立即显示，不等待加载提示的计时', () => {
  expect(render(false)).toBe('<p role="alert">读取失败，请重试</p>');
  expect(runtime.effect).toBeNull();
});

it('提示已显示后发生错误，也立即退出延迟容器', () => {
  render();
  const cleanup = runtime.effect!();
  vi.advanceTimersByTime(300);
  if (typeof cleanup === 'function') cleanup();
  expect(render(false)).toBe('<p role="alert">读取失败，请重试</p>');
});
