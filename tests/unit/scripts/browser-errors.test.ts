import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
  assertNoBrowserErrors,
  installBrowserErrors,
  readBrowserErrors,
} from '../../../e2e/browser-errors.mjs';

function browserPage() {
  const events: { method: string; params: Record<string, unknown> }[] = [];
  let source = '';
  let binding = '';
  const page = {
    async cdp(method: string, params?: Record<string, string>) {
      if (method === 'Runtime.addBinding') binding = params!.name;
      if (method === 'Page.addScriptToEvaluateOnNewDocument') {
        source = params!.source;
        return { identifier: 'error-script' };
      }
    },
    async events() {
      return events.splice(0);
    },
  };
  function navigate(url: string) {
    const listeners = new Map<string, (event: object) => void>();
    const context = createContext({
      location: { href: url },
      console: { error: vi.fn() },
      addEventListener: (name: string, listener: (event: object) => void) =>
        listeners.set(name, listener),
      [binding]: (payload: string) =>
        events.push({
          method: 'Runtime.bindingCalled',
          params: { name: binding, payload },
        }),
    });
    runInContext('window = globalThis', context);
    runInContext(source, context);
    return {
      evaluate: (code: string) => runInContext(code, context),
      dispatch: (name: string, event: object) => listeners.get(name)!(event),
    };
  }
  return { page, navigate, events };
}

describe('browser error reporting across documents', () => {
  it('前页错误在导航到正常新文档后仍使门禁失败，读取后不会重复报告', async () => {
    const { page, navigate } = browserPage();
    expect(await installBrowserErrors(page)).toBe('error-script');
    navigate('http://app/first').evaluate('console.error("first page failed")');
    navigate('http://app/healthy');
    await expect(assertNoBrowserErrors(page)).rejects.toMatchObject({
      actual: [
        {
          url: 'http://app/first',
          kind: 'console.error',
          message: 'first page failed',
        },
      ],
    });
    await expect(assertNoBrowserErrors(page)).resolves.toEqual([]);
  });

  it('跨多次导航保留运行、资源和未处理拒绝错误的来源与顺序', async () => {
    const { page, navigate, events } = browserPage();
    await installBrowserErrors(page);
    const first = navigate('http://app/first');
    first.dispatch('error', { message: 'render failed' });
    first.dispatch('error', { target: { src: 'http://app/missing.js' } });
    navigate('http://app/second').dispatch('unhandledrejection', {
      reason: new Error('request failed'),
    });
    events.push({ method: 'Page.loadEventFired', params: {} });
    events.push({
      method: 'Runtime.bindingCalled',
      params: { name: 'anotherBinding', payload: 'unrelated' },
    });
    expect(await readBrowserErrors(page)).toEqual([
      { url: 'http://app/first', kind: 'error', message: 'render failed' },
      {
        url: 'http://app/first',
        kind: 'error',
        message: 'Resource failed: http://app/missing.js',
      },
      {
        url: 'http://app/second',
        kind: 'unhandledrejection',
        message: 'Error: request failed',
      },
    ]);
    expect(await readBrowserErrors(page)).toEqual([]);
  });
});
