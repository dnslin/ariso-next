import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement, type EffectCallback, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GeneralPage } from '../../../src/components/site/general-page';
import {
  SiteRequestError,
  type SiteSettingsResponse,
} from '../../../src/components/site/api';
import {
  UploadLimitsRequestError,
  type SavedUploadLimits,
} from '../../../src/components/upload-limits/api';

type QueryState = {
  isFetchedAfterMount: boolean;
  isFetching: boolean;
  isSuccess: boolean;
  data?: SiteSettingsResponse | SavedUploadLimits;
  error: Error | null;
};
const runtime = vi.hoisted(() => ({
  rendering: false,
  cursor: 0,
  cells: [] as unknown[],
  effects: [] as EffectCallback[],
  queries: {} as Record<string, QueryState>,
  enabled: {} as Record<string, boolean[]>,
  siteExpired: false,
  uploadExpired: false,
  siteSaved: null as SiteSettingsResponse | null,
  uploadSaved: null as SavedUploadLimits | null,
  siteEditor: vi.fn(),
  uploadEditor: vi.fn(),
  expireSite: vi.fn(),
  expireUpload: vi.fn(),
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!runtime.rendering) return actual.useState(initial);
      const index = runtime.cursor++;
      if (!(index in runtime.cells))
        runtime.cells[index] =
          typeof initial === 'function' ? initial() : initial;
      return [
        runtime.cells[index],
        (value: unknown) => {
          runtime.cells[index] =
            typeof value === 'function' ? value(runtime.cells[index]) : value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      if (!runtime.rendering) return actual.useRef(initial);
      const index = runtime.cursor++;
      return (runtime.cells[index] ??= { current: initial });
    },
    useCallback: (callback: unknown, deps: unknown[]) => {
      if (!runtime.rendering)
        return actual.useCallback(
          callback as (...args: unknown[]) => unknown,
          deps,
        );
      const index = runtime.cursor++;
      const previous = runtime.cells[index] as
        { callback: unknown; deps: unknown[] } | undefined;
      if (
        !previous ||
        deps.some((value, i) => !Object.is(value, previous.deps[i]))
      )
        runtime.cells[index] = { callback, deps };
      return (runtime.cells[index] as { callback: unknown }).callback;
    },
    useEffect: (effect: EffectCallback, deps: unknown[]) => {
      if (!runtime.rendering) return actual.useEffect(effect, deps);
      const index = runtime.cursor++;
      const previous = runtime.cells[index] as unknown[] | undefined;
      if (
        !previous ||
        deps.some((value, i) => !Object.is(value, previous[i]))
      ) {
        runtime.cells[index] = deps;
        runtime.effects.push(effect);
      }
    },
  };
});
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
  useQuery: ({
    queryKey,
    enabled,
  }: {
    queryKey: string[];
    enabled: boolean;
  }) => {
    const key = queryKey[0];
    (runtime.enabled[key] ??= []).push(enabled);
    return { ...runtime.queries[key], refetch: vi.fn() };
  },
}));
vi.mock('../../../src/components/site/use-site-settings', () => ({
  useSiteSettings: (initial: SiteSettingsResponse | null) => {
    if (initial && !runtime.siteSaved) {
      runtime.siteSaved = initial;
      runtime.siteEditor(initial);
    }
    return {
      saved: runtime.siteSaved,
      input: runtime.siteSaved ?? {
        name: '',
        description: '',
        publicUrl: '',
        timeZone: '',
      },
      phase: 'ready',
      expired: runtime.siteExpired,
      locked: !runtime.siteSaved || runtime.siteExpired,
      errors: {},
      message: '',
      originNotice: false,
      timeZoneNotice: false,
      expire: runtime.expireSite,
      change: vi.fn(),
      save: vi.fn(),
    };
  },
}));
vi.mock(
  '../../../src/components/upload-limits/use-upload-limits',
  async (original) => {
    const actual =
      await original<
        typeof import('../../../src/components/upload-limits/use-upload-limits')
      >();
    return {
      useUploadLimits: (sessionLost: boolean) => {
        const upload = actual.useUploadLimits(sessionLost);
        if (upload.saved && !runtime.uploadSaved) {
          runtime.uploadSaved = upload.saved;
          runtime.uploadEditor(upload.saved);
        }
        runtime.expireUpload.mockImplementation(upload.expire);
        return { ...upload, expire: runtime.expireUpload };
      },
    };
  },
);
vi.mock('../../../src/components/upload/provider', () => ({
  useResetUpload: () => vi.fn(),
  useUploadLimitsSync: () => ({
    publishLimits: vi.fn(),
    refreshSettings: vi.fn(),
  }),
}));
vi.mock('@heroui/react/toast', () => ({
  toast: Object.assign(vi.fn(), { close: vi.fn() }),
}));
vi.mock('../../../src/components/site/site-navigation', () => ({
  useSiteNavigation: () => ({ navigate: vi.fn() }),
  SiteLeaveDialog: () => null,
}));
vi.mock('../../../src/components/site/related-settings', () => ({
  RelatedSettings: () => null,
}));
vi.mock('../../../src/components/shell/owner-shell', () => ({
  OwnerShell: ({
    children,
    footer,
  }: {
    children: ReactNode;
    footer: ReactNode;
  }) => createElement('main', null, children, footer),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/general',
  useRouter: () => ({ push: vi.fn() }),
}));
const saved: SiteSettingsResponse = {
  id: 1,
  name: 'Ariso',
  description: '',
  publicUrl: 'https://img.example.com',
  timeZone: 'UTC',
  logoKey: null,
  logoMime: null,
  faviconKey: null,
  faviconMime: null,
  updatedAt: '2026-10-08T00:00:00.000Z',
  githubCallbackUrl: 'https://img.example.com/api/auth/callback/github',
};
const savedUpload: SavedUploadLimits = {
  maxFileMiB: 50,
  maxFileBytes: 50 * 1048576,
  batchSize: 20,
  queueLimit: 500,
};
function loading(data: SiteSettingsResponse | SavedUploadLimits): QueryState {
  // Cached success still cannot substitute for the required first fresh GET.
  return {
    isFetchedAfterMount: false,
    isFetching: true,
    isSuccess: true,
    error: null,
    data,
  };
}
function succeeded(data: SiteSettingsResponse | SavedUploadLimits): QueryState {
  return {
    isFetchedAfterMount: true,
    isFetching: false,
    isSuccess: true,
    error: null,
    data,
  };
}
function failed(error: Error): QueryState {
  return {
    isFetchedAfterMount: true,
    isFetching: false,
    isSuccess: false,
    error,
  };
}
// GeneralPage's effect is delivered explicitly as a mounted lifecycle callback.
// SSR below renders genuine HeroUI forms; SSR itself does not run the effect.
function InitialLoadHarness() {
  runtime.rendering = true;
  runtime.cursor = 0;
  try {
    return GeneralPage({
      name: saved.name,
      description: saved.description,
      email: 'owner@example.test',
      ownerName: 'Owner',
    });
  } finally {
    runtime.rendering = false;
  }
}
function flushEffects() {
  for (const effect of runtime.effects.splice(0)) effect();
}
function saveButton(html: string, group: 'site' | 'upload') {
  const attribute =
    group === 'site' ? 'id="site-save"' : 'data-testid="upload-limits-save"';
  const button = html.match(
    new RegExp(`<button\\b(?=[^>]*${attribute})[^>]*>`),
  )?.[0];
  expect(button, `${group} save remains visible`).toBeDefined();
  return button!;
}
function inputTags(html: string) {
  return html.match(/<input\b(?![^>]*type="hidden")[^>]*>/g) ?? [];
}
beforeEach(() => {
  runtime.cells = [];
  runtime.effects = [];
  runtime.queries = {
    'site-settings': loading(saved),
    'upload-limits': loading(savedUpload),
  };
  runtime.enabled = {};
  runtime.siteExpired = false;
  runtime.uploadExpired = false;
  runtime.siteSaved = null;
  runtime.uploadSaved = null;
  runtime.siteEditor.mockReset();
  runtime.uploadEditor.mockReset();
  runtime.expireSite.mockReset().mockImplementation(() => {
    runtime.siteExpired = true;
  });
  runtime.expireUpload.mockReset().mockImplementation(() => {
    runtime.uploadExpired = true;
  });
});
afterEach(() => {
  runtime.rendering = false;
});

it('初始GET未完成时外壳会话过期，迟到成功不能重新进入编辑器', () => {
  const tree = InitialLoadHarness();
  const loadingHtml = renderToStaticMarkup(tree);
  expect(loadingHtml).toContain('正在读取站点信息');
  expect(loadingHtml).toContain('正在读取上传限制');
  expect(inputTags(loadingHtml)).toHaveLength(0);
  expect(loadingHtml).not.toContain('id="site-settings-form"');
  expect(loadingHtml).not.toContain('id="upload-limits-form"');
  expect(runtime.enabled).toEqual({
    'site-settings': [true],
    'upload-limits': [true],
  });
  tree.props.onSessionExpire();
  runtime.queries = {
    'site-settings': succeeded(saved),
    'upload-limits': succeeded(savedUpload),
  };
  InitialLoadHarness();
  flushEffects();
  const html = renderToStaticMarkup(InitialLoadHarness());
  expect(html).toContain('会话已失效');
  expect(html).toContain('重新登录');
  expect(html).not.toContain('id="site-name"');
  expect(html).not.toContain('id="upload-limits-form"');
  for (const group of ['site', 'upload'] as const)
    expect(saveButton(html, group)).toMatch(/\bdisabled=/);
  expect(runtime.enabled['site-settings'].at(-1)).toBe(false);
  expect(runtime.enabled['upload-limits'].at(-1)).toBe(false);
  expect(runtime.siteEditor).not.toHaveBeenCalled();
  expect(runtime.uploadEditor).not.toHaveBeenCalled();
});
it('会话未过期时成功读取仍正常进入四字段编辑器', () => {
  InitialLoadHarness();
  runtime.queries = {
    'site-settings': succeeded(saved),
    'upload-limits': succeeded(savedUpload),
  };
  InitialLoadHarness();
  flushEffects();
  const html = renderToStaticMarkup(InitialLoadHarness());
  for (const [field, value] of Object.entries({
    name: saved.name,
    description: saved.description,
    publicUrl: saved.publicUrl,
    timeZone: saved.timeZone,
  })) {
    const input = inputTags(html).find((tag) =>
      tag.includes(`id="site-${field}"`),
    );
    expect(input).toContain(`value="${value}"`);
    expect(input).not.toMatch(/\bdisabled=/);
  }
  expect(html).toContain('id="upload-limits-form"');
  expect(inputTags(html)).toHaveLength(7);
  expect(
    inputTags(html)
      .slice(-3)
      .map((input) => input.match(/\bvalue="([^"]*)"/)?.[1]),
  ).toEqual(['50', '20', '500']);
  for (const group of ['site', 'upload'] as const)
    expect(saveButton(html, group)).not.toMatch(/\bdisabled=/);
  expect(html).not.toContain('会话已失效');
  expect(runtime.siteEditor).toHaveBeenCalledOnce();
  expect(runtime.uploadEditor).toHaveBeenCalledOnce();
  expect(runtime.enabled['site-settings'].at(-1)).toBe(false);
  expect(runtime.enabled['upload-limits'].at(-1)).toBe(false);
});
it.each(['site', 'upload'] as const)(
  '%s初读真实401使两组失效，另一组成功和两组迟到数据均不能初始化',
  (group) => {
    InitialLoadHarness();
    runtime.queries = {
      'site-settings':
        group === 'site'
          ? failed(
              new SiteRequestError(401, {
                code: 'UNAUTHORIZED',
                message: '站点会话失效',
              }),
            )
          : succeeded(saved),
      'upload-limits':
        group === 'upload'
          ? failed(
              new UploadLimitsRequestError(401, 'UNAUTHORIZED', '上传会话失效'),
            )
          : succeeded(savedUpload),
    };
    InitialLoadHarness();
    flushEffects();
    expect(runtime.expireSite).toHaveBeenCalledOnce();
    expect(runtime.expireUpload).toHaveBeenCalledOnce();
    runtime.queries = {
      'site-settings': succeeded(saved),
      'upload-limits': succeeded(savedUpload),
    };
    InitialLoadHarness();
    const html = renderToStaticMarkup(InitialLoadHarness());
    expect(html).toContain('会话已失效');
    expect(inputTags(html)).toHaveLength(0);
    expect(html).not.toContain('id="site-settings-form"');
    expect(html).not.toContain('id="upload-limits-form"');
    for (const current of ['site', 'upload'] as const)
      expect(saveButton(html, current)).toMatch(/\bdisabled=/);
    expect(runtime.siteEditor).not.toHaveBeenCalled();
    expect(runtime.uploadEditor).not.toHaveBeenCalled();
    expect(runtime.enabled['site-settings'].at(-1)).toBe(false);
    expect(runtime.enabled['upload-limits'].at(-1)).toBe(false);
  },
);
it.each(['site', 'upload'] as const)(
  '%s非401初读失败只阻止本组，另一组真实表单和保存仍可用',
  (group) => {
    InitialLoadHarness();
    runtime.queries = {
      'site-settings':
        group === 'site'
          ? failed(
              new SiteRequestError(503, { message: '站点读取服务暂不可用' }),
            )
          : succeeded(saved),
      'upload-limits':
        group === 'upload'
          ? failed(
              new UploadLimitsRequestError(
                503,
                'TEMPORARY',
                '上传读取服务暂不可用',
              ),
            )
          : succeeded(savedUpload),
    };
    InitialLoadHarness();
    flushEffects();
    const html = renderToStaticMarkup(InitialLoadHarness());
    expect(html).toContain(
      group === 'site' ? '站点读取服务暂不可用' : '上传读取服务暂不可用',
    );
    expect(html).not.toContain('会话已失效');
    expect(saveButton(html, group)).toMatch(/\bdisabled=/);
    expect(saveButton(html, group === 'site' ? 'upload' : 'site')).not.toMatch(
      /\bdisabled=/,
    );
    const inputs = inputTags(html);
    expect(inputs).toHaveLength(group === 'site' ? 3 : 4);
    if (group === 'site')
      expect(
        inputs.map((input) => input.match(/\bvalue="([^"]*)"/)?.[1]),
      ).toEqual(['50', '20', '500']);
    for (const input of inputs) expect(input).not.toMatch(/\bdisabled=/);
    expect(html).toContain(
      group === 'site' ? 'id="upload-limits-form"' : 'id="site-settings-form"',
    );
    expect(html).not.toContain(
      group === 'site' ? 'id="site-settings-form"' : 'id="upload-limits-form"',
    );
    expect(runtime.expireSite).not.toHaveBeenCalled();
    expect(runtime.expireUpload).not.toHaveBeenCalled();
    expect(
      runtime.enabled[group === 'site' ? 'site-settings' : 'upload-limits'].at(
        -1,
      ),
    ).toBe(true);
    expect(
      runtime.enabled[group === 'site' ? 'upload-limits' : 'site-settings'].at(
        -1,
      ),
    ).toBe(false);
  },
);
