import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EffectCallback } from 'react';
import { useSiteNavigation } from '../../../src/components/site/site-navigation';

const runtime = vi.hoisted(() => ({
  destination: null as unknown,
  leaving: { current: false },
  effect: null as EffectCallback | null,
  push: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: () => [
    runtime.destination,
    (value: unknown) => {
      runtime.destination = value;
    },
  ],
  useRef: () => runtime.leaving,
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: EffectCallback) => {
    runtime.effect = effect;
  },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: runtime.push }),
}));
function NavigationHarness(dirty = true) {
  return useSiteNavigation(dirty);
}
let navigation: EventTarget;
let traverse: ReturnType<typeof vi.fn>;
let cleanup: (() => void) | undefined;
function attempt(
  options: Partial<{
    navigationType: NavigationType;
    destination: Pick<NavigationDestination, 'key' | 'url' | 'sameDocument'>;
    hashChange: boolean;
  }> = {},
  cancelable = true,
) {
  const event = new Event('navigate', { cancelable });
  Object.assign(event, {
    navigationType: 'traverse',
    hashChange: false,
    destination: {
      key: 'previous-upload',
      url: 'http://localhost/upload',
      sameDocument: true,
    },
    ...options,
  });
  navigation.dispatchEvent(event);
  return event;
}
beforeEach(() => {
  runtime.destination = null;
  runtime.leaving = { current: false };
  runtime.push.mockReset();
  navigation = new EventTarget();
  traverse = vi.fn();
  Object.assign(navigation, { traverseTo: traverse });
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      location: {
        pathname: '/settings/general',
        search: '',
        origin: 'http://localhost',
      },
      navigation,
    }),
  );
  vi.stubGlobal('document', new EventTarget());
  NavigationHarness();
  cleanup = runtime.effect!() || undefined;
});
afterEach(() => {
  cleanup?.();
  vi.unstubAllGlobals();
});
it('可取消的历史遍历先确认；放弃时按原条目 key 遍历而不新增路由', () => {
  expect(attempt().defaultPrevented).toBe(true);
  expect(NavigationHarness().destination).not.toBeNull();
  NavigationHarness().cancel();
  expect(runtime.destination).toBeNull();
  expect(traverse).not.toHaveBeenCalled();
  expect(attempt().defaultPrevented).toBe(true);
  NavigationHarness().discard();
  expect(traverse).toHaveBeenCalledWith('previous-upload');
  expect(runtime.push).not.toHaveBeenCalled();
  expect(attempt().defaultPrevented).toBe(false);
  // 许可只消费一次；页面仍处于过渡期时，新遍历继续保护原草稿。
  expect(attempt().defaultPrevented).toBe(true);
});
it('不取消浏览器判定不可取消的遍历，普通push与页内锚点由所属路径处理', () => {
  expect(attempt({}, false).defaultPrevented).toBe(false);
  expect(attempt({ navigationType: 'push' }).defaultPrevented).toBe(false);
  expect(attempt({ hashChange: true }).defaultPrevented).toBe(false);
  expect(
    attempt({
      destination: {
        key: 'external',
        url: 'http://localhost/login',
        sameDocument: false,
      },
    }).defaultPrevented,
  ).toBe(false);
  expect(runtime.destination).toBeNull();
});
it('重复取消保留当前位置，后续不同目标只恢复最后一次选择的历史项', () => {
  for (let i = 0; i < 3; i++) {
    expect(attempt().defaultPrevented).toBe(true);
    NavigationHarness().cancel();
    expect(runtime.destination).toBeNull();
  }
  expect(
    attempt({
      destination: {
        key: 'account-entry',
        url: 'http://localhost/settings/account',
        sameDocument: true,
      },
    }).defaultPrevented,
  ).toBe(true);
  expect(NavigationHarness().destination).toEqual({ key: 'account-entry' });
  NavigationHarness().discard();
  expect(traverse).toHaveBeenCalledOnce();
  expect(traverse).toHaveBeenCalledWith('account-entry');
  expect(runtime.push).not.toHaveBeenCalled();
});
it('跨文档离开仍使用浏览器beforeunload，取消本页历史不改写现有历史项', () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(traverse).not.toHaveBeenCalled();
  expect(runtime.push).not.toHaveBeenCalled();
});
it('取消订阅后不再阻止导航；无草稿不注册离开提示', () => {
  cleanup?.();
  expect(attempt().defaultPrevented).toBe(false);
  NavigationHarness(false);
  cleanup = runtime.effect!() || undefined;
  expect(attempt().defaultPrevented).toBe(false);
});
