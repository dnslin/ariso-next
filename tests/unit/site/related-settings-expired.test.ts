import { beforeEach, expect, it, vi } from 'vitest';
import type { EffectCallback } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RelatedSettings } from '../../../src/components/site/related-settings';
import { StorageRequestError } from '../../../src/components/storage/storage-api';
import { ProcessingRequestError } from '../../../src/components/processing/api';
const runtime = vi.hoisted(() => ({
  capture: false,
  effect: null as EffectCallback | null,
  errors: {} as Record<string, Error | undefined>,
  expire: vi.fn(),
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useEffect: (effect: EffectCallback, deps: unknown[]) => {
      if (runtime.capture) runtime.effect = effect;
      else actual.useEffect(effect, deps);
    },
  };
});
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    error: runtime.errors[queryKey[0]],
    isFetching: false,
  }),
}));
function RelatedSettingsHarness() {
  runtime.capture = true;
  try {
    return RelatedSettings({ onExpire: runtime.expire });
  } finally {
    runtime.capture = false;
  }
}
beforeEach(() => {
  runtime.errors = {};
  runtime.effect = null;
  runtime.expire.mockReset();
});
it.each([
  [500, 401],
  [401, 500],
])(
  '存储设置%s和概览%s分别判定过期，错误展示仍采用设置错误',
  (settingsStatus, overviewStatus) => {
    runtime.errors = {
      'storage-settings': new StorageRequestError(settingsStatus, {
        message: '设置读取错误',
      }),
      'storage-overview': new StorageRequestError(overviewStatus, {
        message: '概览读取错误',
      }),
    };
    const tree = RelatedSettingsHarness();
    runtime.effect!();
    expect(runtime.expire).toHaveBeenCalledOnce();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('设置读取错误');
    expect(html).not.toContain('概览读取错误');
  },
);
it('只有普通模块读取失败不使站点编辑器过期，图片模块401仍通知过期', () => {
  runtime.errors = {
    'storage-settings': new StorageRequestError(500, {
      message: '设置读取错误',
    }),
    'storage-overview': new StorageRequestError(500, {
      message: '概览读取错误',
    }),
  };
  RelatedSettingsHarness();
  runtime.effect!();
  expect(runtime.expire).not.toHaveBeenCalled();
  runtime.errors['processing-settings'] = new ProcessingRequestError(401, {
    message: '会话失效',
  });
  RelatedSettingsHarness();
  runtime.effect!();
  expect(runtime.expire).toHaveBeenCalledOnce();
});
